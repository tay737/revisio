package app.revisio

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import app.revisio.ui.RevisioApp

/**
 * One activity, one Compose tree.
 *
 * There is no WebView and no remote URL to load: the screen the user sees is
 * compiled into the app, so it is available the instant the process starts,
 * with or without a network.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { RevisioApp() }
    }
}
