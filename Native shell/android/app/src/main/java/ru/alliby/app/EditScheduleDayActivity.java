package ru.alliby.app;

import android.app.Activity;
import android.app.TimePickerDialog;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Locale;

public class EditScheduleDayActivity extends Activity {

    private static final String[] WEEKDAY_NAMES_RU = {
        "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"
    };

    private int weekday;
    private int week;
    private LinearLayout container;
    private RadioGroup scopeGroup;
    private boolean dark;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        dark = WidgetPrefs.isDark(this);
        setTheme(dark ? R.style.AppTheme_Dialog_Dark : R.style.AppTheme_Dialog);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_edit_schedule_day);

        weekday = getIntent().getIntExtra("weekday", 1);
        week = getIntent().getIntExtra("week", 1);
        if (weekday < 1 || weekday > 7) weekday = 1;
        if (week != 1 && week != 2) week = 1;

        TextView title = findViewById(R.id.label_screen_title);
        title.setText(WEEKDAY_NAMES_RU[weekday - 1] + " · Неделя " + week);

        container = findViewById(R.id.lessons_container);
        scopeGroup = findViewById(R.id.apply_scope_group);
        ImageButton btnClose = findViewById(R.id.btn_close);
        Button btnAddLesson = findViewById(R.id.btn_add_lesson);
        Button btnSave = findViewById(R.id.btn_save);

        applyTheme();

        for (JSONObject lesson : ScheduleStore.listForDay(this, weekday, week)) {
            container.addView(buildRow(lesson));
        }

        btnClose.setOnClickListener(v -> finish());
        btnAddLesson.setOnClickListener(v -> container.addView(buildRow(null)));
        btnSave.setOnClickListener(v -> save());
    }

    private void applyTheme() {
        findViewById(R.id.dialog_root).setBackgroundResource(
            dark ? R.drawable.dialog_card_bg_dark : R.drawable.dialog_card_bg);

        int textPrimary = dark ? 0xfff0f0f0 : 0xff1a1a1a;
        TextView title = findViewById(R.id.label_screen_title);
        title.setTextColor(textPrimary);

        ImageButton btnClose = findViewById(R.id.btn_close);
        btnClose.setColorFilter(dark ? 0xff9a9a9a : 0xff666666);

        Button btnAddLesson = findViewById(R.id.btn_add_lesson);
        btnAddLesson.setBackgroundResource(dark ? R.drawable.dialog_chip_bg_dark : R.drawable.dialog_chip_bg);
        btnAddLesson.setTextColor(getColorStateList(
            dark ? R.color.dialog_chip_text_dark : R.color.dialog_chip_text));

        RadioButton scopeCurrent = findViewById(R.id.scope_current_week);
        RadioButton scopeBoth = findViewById(R.id.scope_both_weeks);
        scopeCurrent.setTextColor(textPrimary);
        scopeBoth.setTextColor(textPrimary);
    }

    private View buildRow(JSONObject lesson) {
        View row = LayoutInflater.from(this).inflate(R.layout.edit_schedule_lesson_row, container, false);

        int fieldBg = dark ? R.drawable.dialog_field_bg_dark : R.drawable.dialog_field_bg;
        row.setBackgroundResource(fieldBg);

        int textPrimary = dark ? 0xfff0f0f0 : 0xff1a1a1a;
        int textSecondary = dark ? 0xff9a9a9a : 0xff666666;

        EditText subject = row.findViewById(R.id.lesson_input_subject);
        EditText room = row.findViewById(R.id.lesson_input_room);
        TextView time = row.findViewById(R.id.lesson_btn_time);
        EditText duration = row.findViewById(R.id.lesson_input_duration);
        EditText homework = row.findViewById(R.id.lesson_input_homework);
        ImageButton btnDelete = row.findViewById(R.id.lesson_btn_delete);

        subject.setTextColor(textPrimary);
        subject.setHintTextColor(textSecondary);
        room.setTextColor(textPrimary);
        room.setHintTextColor(textSecondary);
        time.setTextColor(textPrimary);
        duration.setTextColor(textPrimary);
        duration.setHintTextColor(textSecondary);
        homework.setTextColor(textPrimary);
        homework.setHintTextColor(textSecondary);
        btnDelete.setColorFilter(textSecondary);

        String startTime = lesson != null ? lesson.optString("startTime", "09:00") : "09:00";
        time.setText(startTime);
        time.setOnClickListener(v -> pickTime(time));

        if (lesson != null) {
            subject.setText(lesson.optString("subject", ""));
            room.setText(lesson.optString("room", ""));
            int durationMin = lesson.optInt("durationMin", 45);
            duration.setText(String.valueOf(durationMin));
            homework.setText(lesson.optString("homework", ""));
        } else {
            duration.setText("45");
        }

        btnDelete.setOnClickListener(v -> container.removeView(row));

        return row;
    }

    private void pickTime(TextView target) {
        Calendar cal = Calendar.getInstance();
        String[] parts = target.getText().toString().split(":");
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        int minute = cal.get(Calendar.MINUTE);
        try {
            hour = Integer.parseInt(parts[0]);
            minute = Integer.parseInt(parts[1]);
        } catch (Exception ignored) {
        }
        new TimePickerDialog(this, (view, h, m) ->
            target.setText(String.format(Locale.US, "%02d:%02d", h, m)), hour, minute, true).show();
    }

    private void save() {
        ArrayList<JSONObject> lessons = new ArrayList<>();
        for (int i = 0; i < container.getChildCount(); i++) {
            View row = container.getChildAt(i);
            EditText subjectField = row.findViewById(R.id.lesson_input_subject);
            String subject = subjectField.getText().toString().trim();
            if (subject.isEmpty()) continue;

            EditText roomField = row.findViewById(R.id.lesson_input_room);
            TextView timeField = row.findViewById(R.id.lesson_btn_time);
            EditText durationField = row.findViewById(R.id.lesson_input_duration);
            EditText homeworkField = row.findViewById(R.id.lesson_input_homework);

            int durationMin;
            try {
                durationMin = Integer.parseInt(durationField.getText().toString().trim());
            } catch (Exception e) {
                durationMin = 45;
            }

            try {
                JSONObject lesson = new JSONObject();
                lesson.put("subject", subject);
                lesson.put("room", roomField.getText().toString().trim());
                lesson.put("startTime", timeField.getText().toString().trim());
                lesson.put("durationMin", durationMin);
                lesson.put("homework", homeworkField.getText().toString().trim());
                lessons.add(lesson);
            } catch (Exception ignored) {
            }
        }

        JSONArray arr = new JSONArray();
        for (JSONObject lesson : lessons) arr.put(lesson);

        boolean bothWeeks = scopeGroup.getCheckedRadioButtonId() == R.id.scope_both_weeks;
        if (bothWeeks) {
            ScheduleStore.replaceForDay(this, weekday, 1, arr);
            ScheduleStore.replaceForDay(this, weekday, 2, arr);
        } else {
            ScheduleStore.replaceForDay(this, weekday, week, arr);
        }
        ScheduleWidgetProvider.refreshAll(this);
        Toast.makeText(this, "Расписание сохранено", Toast.LENGTH_SHORT).show();
        finish();
    }
}
