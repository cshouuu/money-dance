# MoneyDance — 计算规则与异常场景

## 1. 时间统一原则

所有计时逻辑都遵循：

- 数据层保存绝对时间戳（ISO 8601）。
- UI 刷新频率不代表真实计时精度。
- 页面恢复后用 `now - startTime` 重算，而不是恢复一个自增计数器。
- 金额展示可高频更新，但不高频持久化。

## 2. 每日计薪时长

设：

- `S` = 上班时间。
- `E` = 下班时间。
- `B1` = 午休开始。
- `B2` = 午休结束。

### 普通班次

`shiftSeconds = E - S`

### 跨天班次

若 `E < S`：

`shiftSeconds = 24h - S + E`

### 午休不计薪

只减去午休与班次的真实交集：

`paidSeconds = shiftSeconds - overlap(shift, break)`

这样可防止用户把午休填到工作区间外导致负时长。

## 3. 工资周期换算

### 月薪

`dailySalary = monthlySalary / monthlyWorkDays`

### 年薪

`dailySalary = annualSalary / 12 / monthlyWorkDays`

### 日薪

`dailySalary = inputSalary`

### 时薪

`dailySalary = hourlySalary × paidSecondsPerDay / 3600`

随后统一：

`secondSalary = dailySalary / paidSecondsPerDay`

`minuteSalary = secondSalary × 60`

`hourlySalary = secondSalary × 3600`

## 4. 今日已赚金额

### 固定作息

`workedPaidSeconds = 已经过的班次秒数 - 已经过的未计薪休息秒数`

必须 clamp：

`0 <= workedPaidSeconds <= paidSecondsPerDay`

`earnedToday = workedPaidSeconds × secondSalary`

### 午休期间

若午休不计薪，收入数字暂停增长；午休结束后继续。

### 下班后

`workedPaidSeconds = paidSecondsPerDay`，收入封顶为 dailySalary。

### 上班前

`workedPaidSeconds = 0`。

### 弹性作息

弹性作息只累计每一段“开始工作—暂停 / 结束工作”的实际秒数：

`flexibleWorkedSeconds = sum(sessionEnd - sessionStart)`

`flexibleEarned = min(flexibleWorkedSeconds, paidSecondsPerDay) × currentSecondSalary`

- 暂停期间不计薪；午休不会自动从弹性时长中扣除，用户可通过暂停排除实际休息时间。
- 未结束的工作段以当前时间作为临时结束时间；每日实际计薪时长仍封顶为 `paidSecondsPerDay`。
- 时薪用户提前结束时，默认按实际计薪时长结算。
- 月薪、年薪和日薪用户未达到目标工时就结束时，必须选择按实际时长、按正常出勤全天工资，或前往薪苦日历设置请假 / 特殊出勤。
- 达到目标工时后，月薪、年薪和日薪用户自动按全天工资结算。
- 选择全天工资只改变当日收入金额，实际工作时长仍保留真实记录。
- 旧记录没有结算方式时继续按实际时长计算，避免历史短工时被自动放大为全天工资。
- 薪苦日历中的请假、放假或正常出勤自定义工资优先于弹性工作结算方式。

### 薪苦日历工资覆盖

正常出勤未设置计薪方式时，继续使用固定或弹性作息的自动计薪结果。用户明确设置后，按整天工资覆盖：

`normalAttendanceMultiplierPay = dailySalary × attendanceMultiplier`

`normalAttendanceFixedPay = attendanceFixedAmount`

- 倍率和固定金额只覆盖当天工资金额，不改变真实工作时长、工作状态或弹性工作记录。
- 正常出勤自定义工资、请假和放假均优先于当天自动工资及已有的手工工资调整。
- 删除该日出勤调整后，恢复自动计薪；此前被覆盖的手工工资调整重新生效。
- 旧的正常出勤记录没有计薪方式时继续按默认工资计算，不需要数据迁移。

## 5. 商品换算

`requiredSeconds = price / secondSalary`

异常：

- price < 0：拒绝。
- price = 0：0 秒。
- secondSalary = 0：结果为 Infinity，UI 显示 `∞`，不崩溃。

工作日：

`requiredWorkDays = requiredSeconds / paidSecondsPerDay`

注意：不能除固定 8 小时。

## 6. 摸鱼计时

### 进行中

`elapsedSeconds = max(0, now - startTime)`

`earned = elapsedSeconds × currentSecondSalary`

### 结束时

冻结：

`earnedAmount = (endTime - startTime) × 当次结束时使用的 secondSalary`

MVP 不因用户未来修改薪资而重算历史记录。

### 设备时间被修改

浏览器无法可靠防止用户手工修改系统时钟。MVP：

- 若 `end < start`，duration clamp 到 0。
- 后续云同步版可用服务端时间进行异常检测。

## 7. 物品持有成本

`elapsedHours = (now - purchaseDate) / 3600000`

`costPerHour = price / elapsedHours`

异常：

- purchaseDate > now：拒绝新增。
- elapsedHours <= 0：返回 Infinity，UI 显示 `—`。
- price = 0：成本为 0。

## 8. 输入校验表

| 场景 | 规则 | UI 行为 |
|---|---|---|
| 工资为空 | 无法计算 | 禁止保存或显示校验 |
| 工资 < 0 | 非法 | 拒绝 |
| 工资 = 0 | 允许 | 秒薪 0，商品换算 ∞ |
| 月工作日 <= 0 | 非法 | 拒绝 |
| 月工作日 > 31 | UI 限制 | 不建议允许 |
| 上下班相同 | 0 小时班次 | 拒绝保存 |
| 下班 < 上班 | 视为跨天班次 | 正常计算 |
| 午休在班次外 | 不扣除 | 正常计算 |
| 午休覆盖整个班次 | paidSeconds <= 0 | 拒绝保存 |
| 商品价格 < 0 | 非法 | 拒绝 |
| 商品价格 = 0 | 允许 | 0 秒 |
| 购买日期未来 | 非法 | 拒绝 |
| 摸鱼刷新页面 | 恢复 | startTime 继续计时 |
| 多开标签页 | MVP 不做锁 | 可能同时操作；V2 用 BroadcastChannel |
| localStorage 被清空 | 数据丢失 | MVP 可接受；V2 云同步 |
| 时区变化 | ISO 时间戳仍有效 | 日统计日期可能按新本地时区归类 |
| 浏览器休眠 | 不依赖 interval 累加 | 恢复后自动校准 |

## 9. 精度策略

内部全部使用 JavaScript Number 的秒级浮点数；展示层：

- 总金额：2 位小数。
- 时薪：2 位。
- 分钟薪资：3 位。
- 秒薪：5 位。
- 实时金额可以 2 位显示并 100ms 更新。
- 不将格式化后的字符串参与后续计算。

如未来涉及账务结算，再改用 decimal 库；MVP 属于展示型工具，不承担金融结算责任。
