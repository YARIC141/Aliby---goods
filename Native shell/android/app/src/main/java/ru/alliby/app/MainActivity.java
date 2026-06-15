package ru.alliby.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyStatusBar();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyStatusBar();
    }

    private void applyStatusBar() {
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#e8743b"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (window.getInsetsController() != null) {
                window.getInsetsController().setSystemBarsAppearance(
                    0,
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                );
            }
        } else {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(
                decor.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            );
        }
    }
}
