package com.gettransfer.driver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensurePushChannel()
    }

    private fun ensurePushChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            "can_ride_high",
            "CAN-RIDE alerts",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Ride and account push notifications"
        }
        manager.createNotificationChannel(channel)
    }
}
