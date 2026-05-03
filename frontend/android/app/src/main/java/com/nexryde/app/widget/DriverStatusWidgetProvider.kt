package com.nexryde.app.widget

import com.reactnativeandroidwidget.RNWidget

/**
 * Thin widget provider that delegates all lifecycle handling to the JS
 * task handler registered via registerWidgetTaskHandler() in index.ts.
 *
 * The "DriverStatus" key must match the `name` field in app.config.js
 * and the widget info XML (rn_widget_driver_status.xml).
 */
class DriverStatusWidgetProvider : RNWidget("DriverStatus")
