# WidgetStateStore 回归

独立执行生产代码的 `slackingEarnings`，覆盖带薪休息、固定假期工资下的值班、零工资实际工时，以及新旧快照兼容。需要 JDK、Android SDK 的 `android.jar` 和 JSON-java 20240303（Android SDK 中的 JSON 类是不可运行的桩）。不需要模拟器。

在仓库根目录设置 `ANDROID_JAR` 与 `JSON_JAR` 为本机对应文件的绝对路径，再运行 PowerShell：

```powershell
$widgetClasses = Join-Path $env:TEMP 'money-dance-widget-tests'
New-Item -ItemType Directory -Path $widgetClasses -Force | Out-Null
$widgetClasspath = "$env:JSON_JAR;$env:ANDROID_JAR;$widgetClasses"
javac -classpath $widgetClasspath -d $widgetClasses apps/web/native/android/WidgetContract.java apps/web/native/android/WidgetStateStore.java apps/web/native/android/tests/WidgetStateStoreTest.java
if ($LASTEXITCODE -eq 0) {
  java -classpath $widgetClasspath com.cshouuu.moneydance.WidgetStateStoreTest
}
```

成功时输出 `WidgetStateStore: 5 regression cases passed`。这些用例验证计算逻辑；完整 APK 构建及设备上的刷新、展示仍需另行验收。
