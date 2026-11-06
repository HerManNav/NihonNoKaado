package com.example.japanesecards;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Matches :root in styles.css. Android 15+ draws a transparent status bar;
    // the window background supplies the same color behind its inset.
    private static final int APP_BACKGROUND = Color.rgb(247, 246, 242);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        getWindow().setBackgroundDrawable(new ColorDrawable(APP_BACKGROUND));
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(APP_BACKGROUND);
        }
        applyStatusBarAppearance();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            private boolean pending;

            @Override
            public void handleOnBackPressed() {
                if (pending) return;
                if (getBridge() == null || getBridge().getWebView() == null) {
                    fallbackToSystem();
                    return;
                }
                pending = true;
                getBridge().getWebView().evaluateJavascript(
                    "Boolean(window.JapaneseCardsHandleBack && window.JapaneseCardsHandleBack())",
                    handled -> {
                        pending = false;
                        if (!"true".equals(handled)) fallbackToSystem();
                    }
                );
            }

            private void fallbackToSystem() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // Capacitor initializes system bars asynchronously during startup.
        getWindow().getDecorView().post(this::applyStatusBarAppearance);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        getWindow().getDecorView().post(this::applyStatusBarAppearance);
    }

    private void applyStatusBarAppearance() {
        if (Build.VERSION.SDK_INT < 35) getWindow().setStatusBarColor(APP_BACKGROUND);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setAppearanceLightStatusBars(true);
    }
}
