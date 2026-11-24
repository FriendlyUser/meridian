package io.github.friendlyuser.meridian;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in this app, rather than in an npm package, register here.
        registerPlugin(CalendarExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
