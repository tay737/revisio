package app.revisio.engine

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
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
 * The native port is only allowed to exist if it agrees with the original.
 *
 * The vectors are emitted from `src/domain/grading.ts` (the canonical engine) by
 * `scripts/native/grading-vectors.ts`. If a rule changes on the web, this test
 * fails until the native port changes too — which is exactly the guarantee that
 * "grading has one owner" needs, and stronger than either engine testing itself.
 */
class GradingConformanceTest {

    private val vectors: JsonArray = run {
        val stream = javaClass.getResourceAsStream("/grading-vectors.json")
            ?: error("grading-vectors.json missing — run `npx tsx scripts/native/grading-vectors.ts`")
        Json.parseToJsonElement(stream.readBytes().decodeToString()).jsonObject["cases"]!!.jsonArray
    }

    private fun str(element: JsonElement?): String =
        if (element == null || element is JsonNull) "" else element.jsonPrimitive.content

    private fun accepted(element: JsonElement?): List<AcceptedAnswer> =
        EngineJson.decodeFromJsonElement(ListSerializer(AcceptedAnswer.serializer()), element!!)

    @Test
    fun kotlinPortReproducesEveryVector() {
        assertTrue("expected a non-empty vector set", vectors.size > 0)

        for (case in vectors) {
            val obj: JsonObject = case.jsonObject
            val fn = str(obj["fn"])
            val name = str(obj["name"])
            val input = obj["input"]!!.jsonObject
            val expected = obj["expected"]!!.jsonObject

            val actual = when (fn) {
                "gradeCloze" -> Grading.gradeCloze(str(input["answer"]), accepted(input["accepted"]))
                "gradeFlashcard" -> Grading.gradeFlashcard(str(input["answer"]), accepted(input["accepted"]))
                "gradeMcq" -> Grading.gradeMcq(
                    input["selectedOptionId"]?.let { if (it is JsonNull) null else it.jsonPrimitive.content },
                    str(input["correctOptionId"]),
                )
                else -> error("unknown grading function in vectors: $fn")
            }

            val actualJson = EngineJson.encodeToJsonElement(Verdict.serializer(), actual).jsonObject
            assertEquals("$fn — $name", expected, actualJson)
        }
    }
}
