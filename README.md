# Social Game Hold'em（社交德州扑克）

一个基于 Next.js 14 的轻量德州扑克（NLHE）项目，支持：
- 主持端（开局、充值、观察全桌）
- 玩家端（手机可用，入座、行动）
- 中英文切换
- 主池/边池可视化与筹码动效
- 摊牌详情停留展示
- 轻量系统日志（控制台 + 主持端面板）

## 1. 技术栈
- Next.js `14.2.5`
- React `18`
- TypeScript
- CSS Modules
- Node.js Runtime（API Route）

## 2. 核心功能
- 牌局流程：`preflop -> flop -> turn -> river -> showdown -> settled`
- 支持动作：`FOLD / CHECK / CALL / BET / RAISE / ALL_IN`
- 加注规则（NLHE 简化实现）：
  - 有最小加注限制（基于当前规则状态）
  - 输入与后端均限制下注为 `5` 的倍数
- 底池展示：
  - 牌桌中部独立显示“总底池”
  - 支持主池/边池折叠与展开
  - 边池出现与金额变化有轻量动画
- 摊牌展示：
  - 结算后显示摊牌详情（公共牌、玩家手牌、牌型、赢家）
  - 停留到主持点击“开始一手”进入下一手
- 筹码管理：
  - 玩家入座不再填写买入
  - 由主持端在 `waiting` 状态下给已入座玩家充值
  - 充值金额必须为 `5` 的倍数
  - 开局前所有已入座玩家筹码必须 `> 0`

## 3. 日志体系（轻量可见）
项目包含两套日志视角：

1. 业务叙事日志（已有）
- 字段：`snapshot.actionLog`
- 用途：描述牌局动作（谁下注、谁弃牌、谁赢等）

2. 系统结构化日志（新增）
- 服务端统一结构化日志，输出到控制台
- 内存环形缓冲（全局 + 按房间）
- 主持端“系统日志”面板可实时查看（默认 `INFO/WARN/ERROR`）

### 3.1 日志字段
- `ts`, `level`, `scope`, `event`, `message`, `roomCode`, `requestId`, `meta`

### 3.2 日志环境变量
- `LOG_LEVEL`：默认 `info`
- `LOG_BUFFER_GLOBAL`：默认 `500`
- `LOG_BUFFER_PER_ROOM`：默认 `200`
- `LOG_INCLUDE_DEBUG_IN_UI`：默认 `false`

### 3.3 日志接口
- `GET /api/v1/rooms/[roomCode]/host/logs?token=...&limit=100&since=...`
- 仅 host token 可访问
- 默认附带最近全局 `warn/error`（用于快速发现系统异常）

## 4. 页面与角色
- 大厅：`/`
- 主持端：`/host/[roomCode]`
- 玩家端：`/play/[roomCode]`

## 5. API 概览
- `POST /api/v1/rooms`：创建房间（主持）
- `POST /api/v1/rooms/[roomCode]/join`：玩家加入
- `POST /api/v1/rooms/[roomCode]/seat`：玩家入座
- `POST /api/v1/rooms/[roomCode]/host/recharge`：主持充值
- `POST /api/v1/rooms/[roomCode]/host/start-hand`：主持开局
- `POST /api/v1/rooms/[roomCode]/actions`：玩家行动
- `GET /api/v1/rooms/[roomCode]/snapshot`：拉取快照
- `GET /api/v1/rooms/[roomCode]/host/logs`：主持查看系统日志

## 6. 本地开发
### 6.1 安装依赖
```bash
npm install
```

### 6.2 启动开发环境
```bash
npm run dev
```

默认访问 [http://localhost:3000](http://localhost:3000)。

### 6.3 生产构建
```bash
npm run build
npm run start
```

## 7. 资源脚本
- `npm run generate:chips`：生成筹码 SVG 资源
- `npm run verify:cards`：校验 52 张牌素材完整性
- `npm run verify:chips`：校验筹码素材完整性

## 8. 使用流程（推荐）
1. 主持在大厅创建房间，进入主持端。
2. 玩家在大厅输入房间码加入，进入玩家端并入座。
3. 主持在“筹码充值”模块给已入座玩家充值（5 的倍数）。
4. 所有已入座玩家筹码大于 0 后，主持点击“开始一手”。
5. 牌局进行，主持可查看：
   - 牌桌中部底池模块（总池/主池/边池）
   - 摊牌详情
   - 操作日志 + 系统日志

## 9. 数据与部署注意事项
- 当前房间与牌局状态存储在服务进程内存中。
- 服务重启后，房间/牌局/日志会丢失。
- 当前实现适合 MVP 与小规模体验验证，不适合作为最终持久化方案。
- 如果需要多实例和重启恢复，建议后续引入 Redis（状态 + 日志缓冲）或数据库持久化。
