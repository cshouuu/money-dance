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

## 心愿分配组件

`WishProgressProjectionTest.java` 直接调用正式组件使用的金额计算方法，覆盖按心愿 ID 消费分配时段、溢出到下一目标、待分配余额在未来日期入账、快照到期、零价心愿及旧快照兼容。只需 JDK 和上面的 JSON-java，无需 Android 桩：

```powershell
$wishClasses = Join-Path $env:TEMP 'money-dance-wish-tests'
New-Item -ItemType Directory -Path $wishClasses -Force | Out-Null
$wishClasspath = "$env:JSON_JAR;$wishClasses"
javac -classpath $wishClasspath -d $wishClasses apps/web/native/android/WishProgressProjection.java apps/web/native/android/tests/WishProgressProjectionTest.java
if ($LASTEXITCODE -eq 0) {
  java -classpath $wishClasspath com.cshouuu.moneydance.WishProgressProjectionTest
}
```

成功输出 `WishProgressProjection: 10 native regression checks passed`。Web 的 `wishAllocation.test.ts` 同时验证整份清单分配、时间预测与只展示部分心愿的快照输出。
