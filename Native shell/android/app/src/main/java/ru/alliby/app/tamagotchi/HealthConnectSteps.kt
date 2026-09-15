package ru.alliby.app.tamagotchi

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Мост к Health Connect: агрегированные шаги там уже объединяют все источники,
 * которые в него пишут (фитнес-браслет через фирменное приложение, часы, сам
 * телефон через Google Fit/Samsung Health и т.д.) — поэтому если Health Connect
 * доступен и разрешение выдано, берём ТОЛЬКО его число, не складывая со своим
 * датчиком (см. PetStore.getStepsToday), чтобы не задвоить одни и те же шаги.
 */
object HealthConnectSteps {

    private const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"

    @JvmField
    val READ_STEPS_PERMISSIONS: Set<String> = setOf(HealthPermission.getReadPermission(StepsRecord::class))

    fun interface Callback {
        fun onResult(steps: Long?)
    }

    @JvmStatic
    fun sdkStatus(context: Context): Int = HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE)

    @JvmStatic
    fun isAvailable(context: Context): Boolean = sdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    /** Ведёт либо на установку/обновление Health Connect в Play Store, либо в его настройки. */
    @JvmStatic
    fun resolveSetupIntent(context: Context): Intent {
        return if (sdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
        } else {
            Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("market://details?id=$PROVIDER_PACKAGE")
            }
        }
    }

    @JvmStatic
    fun requestPermissionContract(): ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()

    /** Сумма шагов за сегодня (с полуночи по локальному времени) из Health Connect, либо null если недоступно. */
    @JvmStatic
    fun fetchTodaySteps(context: Context, callback: Callback) {
        if (!isAvailable(context)) { callback.onResult(null); return }
        val client = HealthConnectClient.getOrCreate(context)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.containsAll(READ_STEPS_PERMISSIONS)) {
                    callback.onResult(null)
                    return@launch
                }
                val zone = ZoneId.systemDefault()
                val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()
                val response = client.aggregate(
                    AggregateRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(startOfDay, Instant.now())
                    )
                )
                callback.onResult(response[StepsRecord.COUNT_TOTAL] ?: 0L)
            } catch (e: Exception) {
                callback.onResult(null)
            }
        }
    }
}
