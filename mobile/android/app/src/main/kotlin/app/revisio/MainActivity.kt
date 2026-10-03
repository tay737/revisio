package app.revisio

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import app.revisio.ui.RevisioApp

/**
 * One activity, one Compose tree.
 *
 * There is no WebView and no remote URL to load: the screen the user sees is
 * compiled into the app, so it is available the instant the process starts,
 * with or without a network.
 *
 * Edge-to-edge is opted into here because targetSdk 35 forces it anyway on
 * Android 15+ — asking for it explicitly keeps older versions drawing the same
 * way, and lets the Compose tree own the system-bar clearance (insets are
 * consumed once in `RevisioApp`, not fought per screen). The theme no longer
 * paints black bars: the app's own canvas is the background, on every version.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { RevisioApp() }
    }
}
