package io.github.friendlyuser.meridian;

import android.Manifest;
import android.content.ContentProviderOperation;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

/**
 * Copies Meridian's events and tasks into a calendar on the phone, through Android's
 * Calendar Provider. When that calendar belongs to a Google account, Android's own
 * sync carries the events to Google Calendar; the app itself contacts nothing.
 *
 * Deliberately thin: what to add, change and remove is worked out in
 * src/core/calexport.js, which has tests. This lists the calendars, reads back the
 * rows Meridian wrote before, and applies the plan. As a second guard it only ever
 * changes or removes rows in the chosen calendar whose description carries
 * Meridian's reference, so nothing else in the calendar can be touched.
 */
@CapacitorPlugin(
    name = "CalendarExport",
    permissions = {
        @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR })
    }
)
public class CalendarExportPlugin extends Plugin {

    /** Every row Meridian writes ends its description with "From Meridian (meridian:e:<id>)". */
    private static final String REF = "(meridian:";

    private static final String[] EVENT_COLUMNS = {
        Events._ID, Events.TITLE, Events.DESCRIPTION, Events.EVENT_LOCATION, Events.DTSTART,
        Events.DTEND, Events.DURATION, Events.ALL_DAY, Events.RRULE, Events.EVENT_TIMEZONE
    };

    private boolean allowed(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) return true;
        call.reject("Calendar access has not been granted.", "PERMISSION_DENIED");
        return false;
    }

    /** The calendars on this phone that the app may add events to, and whose account each is. */
    @PluginMethod
    public void calendars(PluginCall call) {
        if (!allowed(call)) return;
        String[] columns = {
            Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE,
            Calendars.CALENDAR_COLOR, Calendars.OWNER_ACCOUNT, Calendars.VISIBLE
        };
        String where = Calendars.CALENDAR_ACCESS_LEVEL + " >= ? AND " + Calendars.SYNC_EVENTS + " = 1";
        String[] args = { String.valueOf(Calendars.CAL_ACCESS_CONTRIBUTOR) };
        JSArray list = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(Calendars.CONTENT_URI, columns, where, args, Calendars._ID)) {
            while (c != null && c.moveToNext()) {
                String account = c.getString(2);
                JSObject cal = new JSObject();
                cal.put("id", c.getLong(0));
                cal.put("name", c.getString(1));
                cal.put("account", account);
                cal.put("accountType", c.getString(3));
                cal.put("color", String.format("#%06X", 0xFFFFFF & c.getInt(4)));
                // A Google account's own calendar is the one its owner is the account itself.
                cal.put("primary", account != null && account.equals(c.getString(5)));
                cal.put("visible", c.getInt(6) == 1);
                list.put(cal);
            }
        } catch (Exception e) {
            call.reject("Could not read the phone's calendars: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("calendars", list);
        call.resolve(result);
    }

    /** The rows Meridian wrote to a calendar before (not repeat exceptions, not ones being deleted). */
    @PluginMethod
    public void exported(PluginCall call) {
        if (!allowed(call)) return;
        Long calendarId = call.getLong("calendarId");
        if (calendarId == null) {
            call.reject("No calendar was given.");
            return;
        }
        JSArray rows = new JSArray();
        try (Cursor c = queryMine(calendarId, EVENT_COLUMNS)) {
            while (c != null && c.moveToNext()) {
                JSObject row = new JSObject();
                row.put("id", c.getLong(0));
                row.put("title", c.getString(1));
                row.put("description", c.getString(2));
                row.put("location", c.getString(3));
                row.put("dtstart", c.getLong(4));
                row.put("dtend", c.isNull(5) ? JSONObject.NULL : c.getLong(5));
                row.put("duration", c.isNull(6) ? JSONObject.NULL : c.getString(6));
                row.put("allDay", c.getInt(7) == 1);
                row.put("rrule", c.isNull(8) ? JSONObject.NULL : c.getString(8));
                row.put("timezone", c.getString(9));
                rows.put(row);
            }
        } catch (Exception e) {
            call.reject("Could not read the calendar: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("events", rows);
        call.resolve(result);
    }

    /** Apply a plan from calexport.js: { calendarId, add: [row], change: [{ id, row }], remove: [id] }. */
    @PluginMethod
    public void apply(PluginCall call) {
        if (!allowed(call)) return;
        Long calendarId = call.getLong("calendarId");
        if (calendarId == null) {
            call.reject("No calendar was given.");
            return;
        }
        JSArray add = call.getArray("add", new JSArray());
        JSArray change = call.getArray("change", new JSArray());
        JSArray remove = call.getArray("remove", new JSArray());
        ArrayList<ContentProviderOperation> ops = new ArrayList<>();
        int added = 0, changed = 0, removed = 0, skipped = 0;
        try {
            Set<Long> mine = new HashSet<>();
            try (Cursor c = queryMine(calendarId, new String[] { Events._ID })) {
                while (c != null && c.moveToNext()) mine.add(c.getLong(0));
            }
            for (int i = 0; i < add.length(); i++) {
                JSONObject row = add.getJSONObject(i);
                if (!carriesRef(row)) { skipped++; continue; }
                ContentValues values = values(row);
                values.put(Events.CALENDAR_ID, calendarId);
                ops.add(ContentProviderOperation.newInsert(Events.CONTENT_URI).withValues(values).build());
                added++;
            }
            for (int i = 0; i < change.length(); i++) {
                JSONObject item = change.getJSONObject(i);
                long id = item.getLong("id");
                JSONObject row = item.getJSONObject("row");
                if (!mine.contains(id) || !carriesRef(row)) { skipped++; continue; }
                ops.add(ContentProviderOperation.newUpdate(ContentUris.withAppendedId(Events.CONTENT_URI, id)).withValues(values(row)).build());
                changed++;
            }
            for (int i = 0; i < remove.length(); i++) {
                long id = remove.getLong(i);
                if (!mine.contains(id)) { skipped++; continue; }
                ops.add(ContentProviderOperation.newDelete(ContentUris.withAppendedId(Events.CONTENT_URI, id)).build());
                removed++;
            }
            if (!ops.isEmpty()) getContext().getContentResolver().applyBatch(CalendarContract.AUTHORITY, ops);
        } catch (Exception e) {
            call.reject("Could not write to the calendar: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("added", added);
        result.put("changed", changed);
        result.put("removed", removed);
        result.put("skipped", skipped);
        call.resolve(result);
    }

    private Cursor queryMine(long calendarId, String[] columns) {
        String where = Events.CALENDAR_ID + " = ? AND " + Events.DELETED + " = 0 AND "
            + Events.ORIGINAL_ID + " IS NULL AND " + Events.ORIGINAL_SYNC_ID + " IS NULL AND "
            + Events.DESCRIPTION + " LIKE ?";
        String[] args = { String.valueOf(calendarId), "%" + REF + "%" };
        return getContext().getContentResolver().query(Events.CONTENT_URI, columns, where, args, Events._ID);
    }

    private static boolean carriesRef(JSONObject row) {
        return row.optString("description", "").contains(REF);
    }

    /**
     * A row as Calendar Provider columns. A repeating event needs RRULE and DURATION
     * and no DTEND; any other needs DTEND. Both are always set, one of them to null,
     * so a row can change from one kind to the other.
     */
    private static ContentValues values(JSONObject row) throws JSONException {
        ContentValues v = new ContentValues();
        boolean allDay = row.optBoolean("allDay", false);
        v.put(Events.TITLE, row.optString("title", ""));
        v.put(Events.DESCRIPTION, row.optString("description", ""));
        v.put(Events.EVENT_LOCATION, row.optString("location", ""));
        v.put(Events.ALL_DAY, allDay ? 1 : 0);
        v.put(Events.DTSTART, row.getLong("dtstart"));
        v.put(Events.EVENT_TIMEZONE, allDay ? "UTC" : row.optString("timezone", "UTC"));
        // Like Google Calendar's own defaults: a whole day shows as free, a time as busy.
        v.put(Events.AVAILABILITY, allDay ? Events.AVAILABILITY_FREE : Events.AVAILABILITY_BUSY);
        String rrule = row.isNull("rrule") ? "" : row.optString("rrule", "");
        if (!rrule.isEmpty()) {
            v.put(Events.RRULE, rrule);
            v.put(Events.DURATION, row.getString("duration"));
            v.putNull(Events.DTEND);
        } else {
            v.putNull(Events.RRULE);
            v.putNull(Events.DURATION);
            v.put(Events.DTEND, row.getLong("dtend"));
        }
        return v;
    }
}
