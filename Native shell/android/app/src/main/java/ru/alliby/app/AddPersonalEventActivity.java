package ru.alliby.app;

import android.app.AlarmManager;
import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.PendingIntent;
import android.app.TimePickerDialog;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public class AddPersonalEventActivity extends Activity {

    private String editingId;
    private Calendar selected;
    private EditText inputTitle;
    private EditText inputDetails;
    private TextView btnPickDatetime;
    private TextView labelScreenTitle;
    private TextView labelLead;
    private RadioGroup leadGroup;
    private Button btnDelete;
    private boolean dark;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        dark = WidgetPrefs.isDark(this);
        setTheme(dark ? R.style.AppTheme_Dialog_Dark : R.style.AppTheme_Dialog);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_add_personal_event);

        inputTitle = findViewById(R.id.input_title);
        inputDetails = findViewById(R.id.input_details);
        labelScreenTitle = findViewById(R.id.label_screen_title);
        labelLead = findViewById(R.id.label_lead);
        leadGroup = findViewById(R.id.lead_group);
        btnDelete = findViewById(R.id.btn_delete);
        btnPickDatetime = findViewById(R.id.btn_pick_datetime);
        ImageButton btnClose = findViewById(R.id.btn_close);
        Button btnSave = findViewById(R.id.btn_save);

        applyTheme();

        selected = Calendar.getInstance();
        selected.add(Calendar.HOUR_OF_DAY, 1);
        selected.set(Calendar.MINUTE, 0);
        selected.set(Calendar.SECOND, 0);

        editingId = getIntent().getStringExtra("id");
        if (editingId != null && !editingId.isEmpty()) {
            JSONObject existing = PersonalEventsStore.findPersonal(this, editingId);
            if (existing != null) {
                labelScreenTitle.setText("Редактировать событие");
                inputTitle.setText(existing.optString("title"));
                inputDetails.setText(existing.optString("details"));
                selected.setTimeInMillis(existing.optLong("atMillis"));
                selectLeadRadio(existing.optInt("leadMinutes", 30));
                btnDelete.setVisibility(View.VISIBLE);
            } else {
                editingId = null;
            }
        }
        updateDatetimeLabel();

        btnPickDatetime.setOnClickListener(v -> pickDate());
        btnClose.setOnClickListener(v -> finish());
        btnSave.setOnClickListener(v -> save());
        btnDelete.setOnClickListener(v -> delete());

        ExactAlarmPermission.maybeRequest(this);
    }

    private void applyTheme() {
        int textPrimary = dark ? 0xfff0f0f0 : 0xff1a1a1a;
        int textSecondary = dark ? 0xff9a9a9a : 0xff666666;
        int fieldBg = dark ? R.drawable.dialog_field_bg_dark : R.drawable.dialog_field_bg;
        int chipBg = dark ? R.drawable.dialog_chip_bg_dark : R.drawable.dialog_chip_bg;
        ColorStateList chipText = getColorStateList(
            dark ? R.color.dialog_chip_text_dark : R.color.dialog_chip_text);

        findViewById(R.id.dialog_root).setBackgroundResource(
            dark ? R.drawable.dialog_card_bg_dark : R.drawable.dialog_card_bg);

        labelScreenTitle.setTextColor(textPrimary);
        labelLead.setTextColor(textSecondary);

        inputTitle.setTextColor(textPrimary);
        inputTitle.setHintTextColor(textSecondary);
        inputTitle.setBackgroundResource(fieldBg);

        inputDetails.setTextColor(textPrimary);
        inputDetails.setHintTextColor(textSecondary);
        inputDetails.setBackgroundResource(fieldBg);

        btnPickDatetime.setTextColor(textPrimary);
        btnPickDatetime.setBackgroundResource(fieldBg);
        Drawable[] compound = btnPickDatetime.getCompoundDrawables();
        if (compound[0] != null) compound[0].setColorFilter(textSecondary, android.graphics.PorterDuff.Mode.SRC_IN);

        ImageButton btnClose = findViewById(R.id.btn_close);
        btnClose.setColorFilter(textSecondary);

        int[] leadIds = { R.id.lead_15, R.id.lead_30, R.id.lead_60 };
        for (int id : leadIds) {
            RadioButton rb = findViewById(id);
            rb.setBackgroundResource(chipBg);
            rb.setTextColor(chipText);
        }
    }

    private void selectLeadRadio(int minutes) {
        if (minutes >= 60) {
            leadGroup.check(R.id.lead_60);
        } else if (minutes >= 30) {
            leadGroup.check(R.id.lead_30);
        } else {
            leadGroup.check(R.id.lead_15);
        }
    }

    private int selectedLeadMinutes() {
        int id = leadGroup.getCheckedRadioButtonId();
        if (id == R.id.lead_15) return 15;
        if (id == R.id.lead_60) return 60;
        return 30;
    }

    private void pickDate() {
        new DatePickerDialog(this, (view, year, month, day) -> {
            selected.set(Calendar.YEAR, year);
            selected.set(Calendar.MONTH, month);
            selected.set(Calendar.DAY_OF_MONTH, day);
            pickTime();
        }, selected.get(Calendar.YEAR), selected.get(Calendar.MONTH), selected.get(Calendar.DAY_OF_MONTH)).show();
    }

    private void pickTime() {
        new TimePickerDialog(this, (view, hour, minute) -> {
            selected.set(Calendar.HOUR_OF_DAY, hour);
            selected.set(Calendar.MINUTE, minute);
            selected.set(Calendar.SECOND, 0);
            updateDatetimeLabel();
        }, selected.get(Calendar.HOUR_OF_DAY), selected.get(Calendar.MINUTE), true).show();
    }

    private void updateDatetimeLabel() {
        SimpleDateFormat fmt = new SimpleDateFormat("d MMMM yyyy, HH:mm", Locale.getDefault());
        btnPickDatetime.setText(fmt.format(selected.getTime()));
    }

    private void save() {
        String title = inputTitle.getText().toString().trim();
        if (title.isEmpty()) {
            Toast.makeText(this, "Введите название события", Toast.LENGTH_SHORT).show();
            return;
        }
        if (selected.getTimeInMillis() <= System.currentTimeMillis()) {
            Toast.makeText(this, "Выберите время в будущем", Toast.LENGTH_SHORT).show();
            return;
        }

        String id = (editingId != null && !editingId.isEmpty()) ? editingId : "p_" + System.currentTimeMillis();
        int leadMinutes = selectedLeadMinutes();
        long atMillis = selected.getTimeInMillis();

        try {
            JSONObject event = new JSONObject();
            event.put("id", id);
            event.put("type", "personal");
            event.put("title", title);
            event.put("details", inputDetails.getText().toString().trim());
            event.put("atMillis", atMillis);
            event.put("leadMinutes", leadMinutes);
            PersonalEventsStore.upsertPersonal(this, event);
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось сохранить событие", Toast.LENGTH_SHORT).show();
            return;
        }

        scheduleAlarm(id, title, atMillis - leadMinutes * 60_000L);
        AllibyWidgetProvider.refreshAll(this);
        finish();
    }

    private void delete() {
        if (editingId == null) return;
        PersonalEventsStore.deletePersonal(this, editingId);
        cancelAlarm(editingId);
        AllibyWidgetProvider.refreshAll(this);
        finish();
    }

    private PendingIntent alarmPendingIntent(String id, String title) {
        Intent intent = new Intent(this, PersonalEventAlarmReceiver.class);
        intent.putExtra("id", id);
        intent.putExtra("title", title);
        return PendingIntent.getBroadcast(
            this, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void scheduleAlarm(String id, String title, long triggerAtMillis) {
        AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmPendingIntent(id, title);
        boolean canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        try {
            if (canExact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        }
    }

    private void cancelAlarm(String id) {
        AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (am == null) return;
        am.cancel(alarmPendingIntent(id, ""));
    }
}
