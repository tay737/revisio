package app.revisio.engine

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The comparison an update prompt is made of.
 *
 * The server publishes the latest build number and a floor; the client decides
 * between "current", "available" and "required". These are the vectors both
 * engines agree on — a wrong "required" would alarm a current install, and a
 * missed "required" would leave an old build that cannot work still running.
 */
class UpdateCheckTest {
    @Test
    fun `current build is silent`() {
        assertEquals(UpdateKind.None, checkForUpdate(10000, 10000, 0).kind)
        assertEquals(UpdateKind.None, checkForUpdate(10001, 10000, 0).kind)
    }

    @Test
    fun `newer server build is available`() {
        assertEquals(UpdateKind.Available, checkForUpdate(10000, 10001, 0).kind)
        assertEquals(UpdateKind.Available, checkForUpdate(10005, 10006, 0).kind)
    }

    @Test
    fun `below the floor is required`() {
        assertEquals(UpdateKind.Required, checkForUpdate(9999, 10002, 10000).kind)
        assertEquals(UpdateKind.Required, checkForUpdate(0, 10002, 1).kind)
    }

    @Test
    fun `at the floor is only available, not required`() {
        assertEquals(UpdateKind.Available, checkForUpdate(10000, 10002, 10000).kind)
    }

    @Test
    fun `prerelease ordering goes by the build number, not the string`() {
        // `1.0.0-alpha.10` sorts below `1.0.0-alpha.9` as a string but is a
        // strictly newer build — which is why the comparison is numeric.
        assertEquals(UpdateKind.Available, checkForUpdate(10009, 10010, 0).kind)
    }
}
