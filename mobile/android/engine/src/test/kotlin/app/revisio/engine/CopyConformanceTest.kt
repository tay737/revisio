package app.revisio.engine

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The phone's rank and copy are only allowed to exist if they agree with the web.
 *
 * Two things on this client are not decided by a payload and so had to be carried:
 * the **ladder** (the screen draws all fifteen rungs, and the ones nobody has
 * reached are not facts about anybody) and the **sentences** (a phone that
 * invented its own words for "Good morning" would drift the moment the copy
 * changed). They are ports of `src/domain/ranked.ts` and `src/lib/profile.ts`.
 *
 * A port is only honest if it agrees with the original, so the vectors are
 * emitted from those files by `scripts/native/copy-vectors.ts`. Change a nuance on
 * the web and this test fails until the Kotlin follows — the same guarantee the
 * grading conformance test carries, for the words and the numbers a learner sees.
 */
class CopyConformanceTest {

    private val root: JsonObject = run {
        val stream = javaClass.getResourceAsStream("/copy-vectors.json")
            ?: error("copy-vectors.json missing — run `npm run vectors:copy`")
        Json.parseToJsonElement(stream.readBytes().decodeToString()).jsonObject
    }

    private fun cases(name: String) = root[name]!!.jsonArray

    private fun JsonElement?.text(): String =
        if (this == null || this is JsonNull) "" else this.jsonPrimitive.content

    private fun JsonElement?.int(): Int = text().toInt()

    /** An optional field: absent is the same as null, which is what the web means. */
    private fun JsonObject.optional(key: String): String? =
        if (this[key] == null || this[key] is JsonNull) null else this[key]!!.text()

    private fun JsonElement?.boolean(): Boolean = text().toBoolean()

    private fun case(label: String, block: () -> Unit) {
        try {
            block()
        } catch (failure: AssertionError) {
            throw AssertionError("$label — ${failure.message}")
        }
    }

    @Test
    fun theLadderIsTheWebsLadder() {
        val ladder = root["ladder"]!!.jsonObject
        val rungs = ladder["rungs"]!!.jsonArray.map { it.jsonObject }
        assertEquals("the wiki's ladder is fifteen rungs", 15, rungs.size)
        assertEquals(
            "the ladder's top must match",
            ladder["topOfLadder"]!!.int(),
            RankLadder.TOP_OF_LADDER,
        )
        rungs.forEachIndexed { index, rung ->
            val mine = RankLadder.rungs[index]
            case("rung $index") {
                assertEquals(rung["tier"]!!.text(), mine.tier)
                assertEquals(rung["division"]!!.int(), mine.division)
                assertEquals(rung["index"]!!.int(), mine.index)
                assertEquals(rung["base"]!!.int(), mine.base)
                assertEquals(rung["span"]!!.int(), mine.span)
            }
        }
        for ((tier, name) in ladder["tierNames"]!!.jsonArray.map {
            it.jsonObject["tier"]!!.text() to it.jsonObject["expected"]!!.text()
        }) {
            assertEquals("tierName($tier)", name, RankLadder.tierName(tier))
        }
    }

    @Test
    fun kotlinRankForReproducesEveryVector() {
        val vectors = cases("rankFor")
        assertTrue("expected a non-empty vector set", vectors.size > 0)
        vectors.forEach { vector ->
            val entry = vector.jsonObject
            val expected = entry["expected"]!!.jsonObject
            val xp = entry["xp"]!!.int()
            val mine = RankLadder.rankFor(xp)
            case("rankFor($xp)") {
                assertEquals(expected["tier"]!!.text(), mine.tier)
                assertEquals(expected["division"]!!.int(), mine.division)
                assertEquals(expected["index"]!!.int(), mine.index)
                assertEquals(expected["label"]!!.text(), mine.label)
                assertEquals(expected["short"]!!.text(), mine.short)
                assertEquals(expected["points"]!!.int(), mine.points)
                assertEquals(expected["intoDivision"]!!.int(), mine.intoDivision)
                assertEquals(expected["forDivision"]!!.int(), mine.forDivision)
                assertEquals(expected["percent"]!!.int(), mine.percent)
                assertEquals(expected["remaining"]!!.int(), mine.remaining)
                assertEquals(expected["isApex"]!!.boolean(), mine.isApex)
            }
        }
    }

    @Test
    fun kotlinCopyReproducesEveryPhrase() {
        cases("formFor").forEach { vector ->
            val entry = vector.jsonObject
            val expected = entry["expected"]!!.jsonObject
            val reviewed = entry["reviewed"]!!.int()
            val correct = entry["correct"]!!.int()
            val mine = Copy.formFor(reviewed, correct)
            case("formFor($reviewed, $correct)") {
                assertEquals(expected["form"]!!.text(), mine.form)
                assertEquals(expected["label"]!!.text(), mine.label)
                assertEquals(expected["detail"]!!.text(), mine.detail)
            }
        }

        cases("zoneBand").forEach { vector ->
            val entry = vector.jsonObject
            val size = entry["size"]!!.int()
            assertEquals("zoneBand($size)", entry["expected"]!!.int(), RankLadder.zoneBand(size))
        }

        cases("reviewsForRp").forEach { vector ->
            val entry = vector.jsonObject
            val rp = entry["rp"]!!.int()
            assertEquals("reviewsForRp($rp)", entry["expected"]!!.int(), RankLadder.reviewsForRp(rp))
        }

        cases("greeting").forEach { vector ->
            val entry = vector.jsonObject
            val hour = entry["hour"]!!.int()
            assertEquals("greeting($hour)", entry["expected"]!!.text(), Copy.greeting(hour))
        }

        cases("names").forEach { vector ->
            val entry = vector.jsonObject
            val name = entry["name"]!!.text()
            assertEquals("firstName($name)", entry["first"]!!.text(), Copy.firstName(name))
            assertEquals("initials($name)", entry["initials"]!!.text(), Copy.initials(name))
        }

        cases("sessionSummary").forEach { vector ->
            val entry = vector.jsonObject
            val correct = entry["correct"]!!.int()
            val total = entry["total"]!!.int()
            assertEquals(
                "sessionSummary($correct, $total)",
                entry["expected"]!!.text(),
                Copy.sessionSummary(correct, total),
            )
        }

        cases("emptyQueueLine").forEach { vector ->
            val entry = vector.jsonObject
            val due = entry["due"]!!.int()
            val streak = entry["streak"]!!.int()
            assertEquals(
                "emptyQueueLine($due, $streak)",
                entry["expected"]!!.text(),
                Copy.emptyQueueLine(due, streak),
            )
        }

        cases("openers").forEach { vector ->
            val entry = vector.jsonObject
            val due = entry["due"]!!.int()
            val streak = entry["streak"]!!.int()
            val level = entry["level"]!!.int()
            val subject = entry.optional("subject")
            assertEquals(
                "openers(due=$due, streak=$streak, level=$level, subject=$subject)",
                entry["expected"]!!.jsonArray.map { it.text() },
                Copy.openers(due, streak, level, subject),
            )
        }

        cases("lobbyLine").forEach { vector ->
            val entry = vector.jsonObject
            val zone = entry["zone"]!!.text()
            val position = entry["position"]!!.int()
            val size = entry["size"]!!.int()
            val daysLeft = entry["daysLeft"]!!.int()
            val rankLabel = entry["rankLabel"]!!.text()
            assertEquals(
                "lobbyLine($zone, $position, $size, $daysLeft, $rankLabel)",
                entry["expected"]!!.text(),
                Copy.lobbyLine(zone, position, size, daysLeft, rankLabel),
            )
        }

        cases("companionFor").forEach { vector ->
            val entry = vector.jsonObject
            val input = entry["input"]!!.jsonObject
            val expected = entry["expected"]!!.jsonObject
            val read = Copy.companionFor(
                name = input["name"]!!.text(),
                due = input["due"]!!.int(),
                reviewed = input["reviewed"]!!.int(),
                correct = input["correct"]!!.int(),
                streak = input["streak"]!!.int(),
                bestStreak = input["bestStreak"]!!.int(),
                totalXp = input["totalXp"]!!.int(),
                rankLabel = input.optional("rankLabel"),
                hour = input["hour"]!!.int(),
            )
            case("companionFor($input)") {
                assertEquals(expected["tone"]!!.text(), read.tone)
                assertEquals(expected["line"]!!.text(), read.line)
                assertEquals(expected["actionLabel"]!!.text(), read.actionLabel)
            }
        }
    }
}
