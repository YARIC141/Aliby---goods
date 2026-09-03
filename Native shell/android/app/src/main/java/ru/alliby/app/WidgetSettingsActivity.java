package ru.alliby.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.RadioGroup;

public class WidgetSettingsActivity extends Activity {

    private RadioGroup themeGroup;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_widget_settings);

        themeGroup = findViewById(R.id.theme_group);
        Button btnReminderSettings = findViewById(R.id.btn_reminder_settings);
        Button btnCancel = findViewById(R.id.btn_cancel);
        Button btnSave = findViewById(R.id.btn_save);

        String mode = WidgetPrefs.themeMode(this);
        if ("light".equals(mode)) {
            themeGroup.check(R.id.theme_light);
        } else if ("dark".equals(mode)) {
            themeGroup.check(R.id.theme_dark);
        } else {
            themeGroup.check(R.id.theme_system);
        }

        btnReminderSettings.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("alliby://open?screen=reminders"));
            intent.setPackage(getPackageName());
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
            finish();
        });

        btnCancel.setOnClickListener(v -> finish());
        btnSave.setOnClickListener(v -> save());
    }

    private void save() {
        int checked = themeGroup.getCheckedRadioButtonId();
        String mode;
        if (checked == R.id.theme_light) {
            mode = "light";
        } else if (checked == R.id.theme_dark) {
            mode = "dark";
        } else {
            mode = "system";
        }
        WidgetPrefs.setThemeMode(this, mode);
        AllibyWidgetProvider.refreshAllFull(this);
        finish();
    }
}
