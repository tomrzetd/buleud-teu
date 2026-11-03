package id.buleudteu.ljk

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import id.buleudteu.ljk.ui.AppRoot
import org.opencv.android.OpenCVLoader

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!OpenCVLoader.initLocal()) vm.say("OpenCV gagal dimuat; deteksi marker real-time dimatikan")
        val perm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (!ok) vm.say("Izin kamera ditolak — gunakan tombol galeri") }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) perm.launch(Manifest.permission.CAMERA)
        setContent {
            BackHandler(enabled = vm.screen != Screen.HOME && vm.screen != Screen.LOGIN && vm.screen != Screen.SETUP) {
                vm.screen = when (vm.screen) { Screen.RESULT -> Screen.SCAN; Screen.SCAN -> if (vm.scanMode == ScanMode.KEY) Screen.EXAM else Screen.HOME; else -> Screen.HOME }
            }
            AppRoot(vm)
        }
    }
}
