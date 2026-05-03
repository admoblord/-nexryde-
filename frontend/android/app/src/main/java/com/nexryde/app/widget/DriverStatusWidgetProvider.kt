package com.nexryde.app.widget

import com.reactnativeandroidwidget.RNWidgetProvider

/**
 * Thin widget provider that delegates all lifecycle handling to the JS
 * task handler registered via registerWidgetTaskHandler() in index.ts.
 */
class DriverStatusWidgetProvider : RNWidgetProvider()
