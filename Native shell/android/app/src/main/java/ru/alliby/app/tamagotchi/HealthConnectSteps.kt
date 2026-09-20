package ru.alliby.app.tamagotchi

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Мост к Health Connect: агрегированные метрики там уже объединяют все источники,
 * которые в него пишут (фитнес-браслет через фирменное приложение, часы, сам
 * телефон через Google Fit/Samsung Health и т.д.) — поэтому если Health Connect
 * доступен и разрешение выдано, берём ТОЛЬКО его число, не складывая со своим
 * датчиком (см. PetStore.getStepsToday), чтобы не задвоить одни и те же шаги.
 * Тот же принцип применяется и к остальным метрикам ниже.
 */
object HealthConnectSteps {

    private const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"

    private val PERMISSION_STEPS = HealthPermission.getReadPermission(StepsRecord::class)
    private val PERMISSION_DISTANCE = HealthPermission.getReadPermission(DistanceRecord::class)
    private val PERMISSION_CALORIES = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
    private val PERMISSION_SLEEP = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val PERMISSION_EXERCISE = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    private val PERMISSION_HEART_RATE = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val PERMISSION_WEIGHT = HealthPermission.getReadPermission(WeightRecord::class)
    private val PERMISSION_BODY_FAT = HealthPermission.getReadPermission(BodyFatRecord::class)

    @JvmField
    val READ_STEPS_PERMISSIONS: Set<String> = setOf(PERMISSION_STEPS)

    /** Полный набор разрешений, запрашиваемый у пользователя одним экраном Health Connect. */
    @JvmField
    val READ_ALL_PERMISSIONS: Set<String> = setOf(
        PERMISSION_STEPS, PERMISSION_DISTANCE, PERMISSION_CALORIES,
        PERMISSION_SLEEP, PERMISSION_EXERCISE, PERMISSION_HEART_RATE,
        PERMISSION_WEIGHT, PERMISSION_BODY_FAT
    )

    fun interface Callback {
        fun onResult(steps: Long?)
    }

    /** Каждое поле независимо null, если Health Connect недоступен или разрешение на
     * конкретную метрику не выдано. Если разрешение выдано, но записей за период нет
     * (например, ещё рано и шагов/сна не было), поле = 0, а не null — иначе легитимный
     * ноль неотличим от "нет доступа" и на экране/виджете метрика ошибочно скрывается. */
    data class TodayMetrics(
        val distanceMeters: Double?,
        val activeCaloriesKcal: Double?,
        val sleepMinutes: Long?,
        val exerciseMinutes: Long?,
        val avgHeartRateBpm: Long?
    )

    fun interface MetricsCallback {
        fun onResult(metrics: TodayMetrics)
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

    /**
     * Остальные метрики за сегодня из Health Connect: дистанция, активные калории,
     * сон, тренировки, средний пульс. Каждая метрика читается независимо — если
     * разрешение на неё не выдано или запрос упал с ошибкой, просто возвращается
     * null по этому полю, а не по всему результату (в отличие от шагов, здесь нет
     * единого флага available — пользователь может разрешить часть метрик и
     * отклонить остальные в системном экране Health Connect).
     */
    @JvmStatic
    fun fetchTodayMetrics(context: Context, callback: MetricsCallback) {
        if (!isAvailable(context)) { callback.onResult(TodayMetrics(null, null, null, null, null)); return }
        val client = HealthConnectClient.getOrCreate(context)
        CoroutineScope(Dispatchers.IO).launch {
            val granted = try {
                client.permissionController.getGrantedPermissions()
            } catch (e: Exception) {
                emptySet()
            }

            val zone = ZoneId.systemDefault()
            val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()
            val now = Instant.now()
            val todayRange = TimeRangeFilter.between(startOfDay, now)
            // Сон обычно приходится на ночь ДО полуночи, поэтому "сон за сегодня"
            // считаем скользящим окном в последние 24 часа, а не с полуночи.
            val last24hRange = TimeRangeFilter.between(now.minus(Duration.ofHours(24)), now)

            var distanceMeters: Double? = null
            var activeCaloriesKcal: Double? = null
            var sleepMinutes: Long? = null
            var exerciseMinutes: Long? = null
            var avgHeartRateBpm: Long? = null

            if (granted.contains(PERMISSION_DISTANCE)) {
                try {
                    val r = client.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), todayRange))
                    distanceMeters = r[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
                } catch (e: Exception) {}
            }
            if (granted.contains(PERMISSION_CALORIES)) {
                try {
                    val r = client.aggregate(AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), todayRange))
                    activeCaloriesKcal = r[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0
                } catch (e: Exception) {}
            }
            if (granted.contains(PERMISSION_SLEEP)) {
                try {
                    val r = client.aggregate(AggregateRequest(setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL), last24hRange))
                    sleepMinutes = r[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMinutes() ?: 0L
                } catch (e: Exception) {}
            }
            if (granted.contains(PERMISSION_EXERCISE)) {
                try {
                    val r = client.aggregate(AggregateRequest(setOf(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL), todayRange))
                    exerciseMinutes = r[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes() ?: 0L
                } catch (e: Exception) {}
            }
            if (granted.contains(PERMISSION_HEART_RATE)) {
                try {
                    val r = client.aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG), todayRange))
                    avgHeartRateBpm = r[HeartRateRecord.BPM_AVG]
                } catch (e: Exception) {}
            }

            callback.onResult(TodayMetrics(distanceMeters, activeCaloriesKcal, sleepMinutes, exerciseMinutes, avgHeartRateBpm))
        }
    }

    /** Одна тренировка за сегодня: конкретная сессия с началом/концом, а не суточный агрегат
     * (в отличие от exerciseMinutes выше), плюс её собственный средний пульс и оценка калорий
     * по формуле MET × вес × время — вес берётся из TamagotchiPrefs (зеркалирован из веб-версии). */
    data class WorkoutSession(
        val startTimeMs: Long,
        val endTimeMs: Long,
        val exerciseType: Int,
        val label: String,
        val avgHeartRateBpm: Long?,
        val caloriesKcal: Double?
    )

    fun interface WorkoutsCallback {
        fun onResult(sessions: List<WorkoutSession>)
    }

    /** MET (Metabolic Equivalent of Task) и русское название по типу тренировки Health Connect.
     * Официальной калорийности сессии в Health Connect может не быть (не все источники её пишут),
     * поэтому считаем её сами по стандартной формуле kcal = MET × вес(кг) × время(ч). */
    private fun exerciseLabelAndMet(type: Int): Pair<String, Double> = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Ходьба" to 3.5
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Бег" to 9.8
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Велосипед" to 7.5
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Плавание" to 8.0
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING,
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "Силовая тренировка" to 5.0
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA,
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES,
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "Йога/растяжка" to 3.0
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "Поход" to 6.0
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "Эллипсоид" to 5.0
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING,
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "Гребля" to 7.0
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "Лестница" to 8.0
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "Танцы" to 5.5
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "Интервальная тренировка" to 8.0
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING,
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "Единоборства" to 7.5
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "Баскетбол" to 6.5
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER,
        ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AMERICAN,
        ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AUSTRALIAN -> "Футбол" to 7.0
        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS,
        ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON,
        ExerciseSessionRecord.EXERCISE_TYPE_SQUASH,
        ExerciseSessionRecord.EXERCISE_TYPE_RACQUETBALL,
        ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS -> "Ракеточный спорт" to 6.5
        ExerciseSessionRecord.EXERCISE_TYPE_SKIING,
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING,
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWSHOEING,
        ExerciseSessionRecord.EXERCISE_TYPE_ICE_SKATING,
        ExerciseSessionRecord.EXERCISE_TYPE_SKATING -> "Зимний спорт" to 6.5
        ExerciseSessionRecord.EXERCISE_TYPE_GYMNASTICS -> "Гимнастика" to 4.0
        ExerciseSessionRecord.EXERCISE_TYPE_GOLF -> "Гольф" to 4.3
        else -> "Тренировка" to 5.0
    }

    /** Список тренировок за сегодня с их собственным временем начала/конца (а не суточный
     * агрегат), средним пульсом за КАЖДУЮ сессию отдельно и оценкой калорий. */
    @JvmStatic
    fun fetchTodayWorkouts(context: Context, callback: WorkoutsCallback) {
        if (!isAvailable(context)) { callback.onResult(emptyList()); return }
        val client = HealthConnectClient.getOrCreate(context)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.contains(PERMISSION_EXERCISE)) { callback.onResult(emptyList()); return@launch }

                val zone = ZoneId.systemDefault()
                val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()
                val now = Instant.now()
                val response = client.readRecords(
                    ReadRecordsRequest(
                        recordType = ExerciseSessionRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
                    )
                )

                val hasHeartRate = granted.contains(PERMISSION_HEART_RATE)
                val weightKg = TamagotchiPrefs.bodyWeightKg(context)

                val sessions = response.records.map { record ->
                    var avgHr: Long? = null
                    if (hasHeartRate) {
                        try {
                            val hrRange = TimeRangeFilter.between(record.startTime, record.endTime)
                            val r = client.aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG), hrRange))
                            avgHr = r[HeartRateRecord.BPM_AVG]
                        } catch (e: Exception) {}
                    }
                    val (label, met) = exerciseLabelAndMet(record.exerciseType)
                    val durationHours = Duration.between(record.startTime, record.endTime).toMillis() / 3_600_000.0
                    val calories = if (weightKg > 0) met * weightKg * durationHours else null
                    WorkoutSession(
                        startTimeMs = record.startTime.toEpochMilli(),
                        endTimeMs = record.endTime.toEpochMilli(),
                        exerciseType = record.exerciseType,
                        label = label,
                        avgHeartRateBpm = avgHr,
                        caloriesKcal = calories
                    )
                }.sortedBy { it.startTimeMs }

                callback.onResult(sessions)
            } catch (e: Exception) {
                callback.onResult(emptyList())
            }
        }
    }

    /** Последнее известное измерение веса и % жира тела (не "за сегодня" — весы обычно
     * взвешивают не каждый день, поэтому берём самую свежую запись за последние 90 дней). */
    data class BodyMetrics(
        val weightKg: Double?,
        val bodyFatPercent: Double?
    )

    fun interface BodyMetricsCallback {
        fun onResult(metrics: BodyMetrics)
    }

    @JvmStatic
    fun fetchLatestBodyMetrics(context: Context, callback: BodyMetricsCallback) {
        if (!isAvailable(context)) { callback.onResult(BodyMetrics(null, null)); return }
        val client = HealthConnectClient.getOrCreate(context)
        CoroutineScope(Dispatchers.IO).launch {
            val granted = try {
                client.permissionController.getGrantedPermissions()
            } catch (e: Exception) {
                Log.e("TamaBodyMetrics", "getGrantedPermissions failed", e)
                emptySet()
            }
            Log.d("TamaBodyMetrics", "granted contains WEIGHT=" + granted.contains(PERMISSION_WEIGHT) +
                " BODY_FAT=" + granted.contains(PERMISSION_BODY_FAT) + " all=" + granted)
            val range = TimeRangeFilter.between(Instant.now().minus(Duration.ofDays(90)), Instant.now())

            var weightKg: Double? = null
            if (granted.contains(PERMISSION_WEIGHT)) {
                try {
                    val response = client.readRecords(
                        ReadRecordsRequest(
                            recordType = WeightRecord::class,
                            timeRangeFilter = range,
                            ascendingOrder = false,
                            pageSize = 1
                        )
                    )
                    Log.d("TamaBodyMetrics", "WeightRecord count=" + response.records.size)
                    weightKg = response.records.firstOrNull()?.weight?.inKilograms
                } catch (e: Exception) {
                    Log.e("TamaBodyMetrics", "WeightRecord read failed", e)
                }
            }

            var bodyFatPercent: Double? = null
            if (granted.contains(PERMISSION_BODY_FAT)) {
                try {
                    val response = client.readRecords(
                        ReadRecordsRequest(
                            recordType = BodyFatRecord::class,
                            timeRangeFilter = range,
                            ascendingOrder = false,
                            pageSize = 1
                        )
                    )
                    Log.d("TamaBodyMetrics", "BodyFatRecord count=" + response.records.size)
                    bodyFatPercent = response.records.firstOrNull()?.percentage?.value
                } catch (e: Exception) {
                    Log.e("TamaBodyMetrics", "BodyFatRecord read failed", e)
                }
            }

            Log.d("TamaBodyMetrics", "result weightKg=" + weightKg + " bodyFatPercent=" + bodyFatPercent)
            callback.onResult(BodyMetrics(weightKg, bodyFatPercent))
        }
    }
}
