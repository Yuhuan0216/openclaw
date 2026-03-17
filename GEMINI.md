# 🦞 OpenClaw Project Context

## 專案概述 (Project Overview)

**OpenClaw** 是一個開源的個人 AI 助手閘道器 (Gateway)，旨在讓使用者在自己控制的設備上執行私人助理。它能整合多種通訊頻道 (WhatsApp, Telegram, Discord, Slack, iMessage 等)，支援語音互動、即時畫布 (Canvas) 以及多代理 (Multi-agent) 路由。

- **核心技術**: Node.js (>= 22.12), TypeScript, pnpm (monorepo)。
- **架構設計**:
  - **Gateway**: 核心控制平面，處理 Session、頻道整合、工具調用與事件流。
  - **Pi Agent Runtime**: 基於 `@mariozechner/pi-agent-core` 的代理執行環境。
  - **Extensions**: 插件式架構，將各通訊平台與 AI 模型服務商隔離為獨立擴展。
  - **Cross-platform**: 提供 Web UI、macOS 菜單欄應用、以及 iOS/Android 節點應用。

## 開發與運行 (Building and Running)

### 環境需求

- **Node.js**: v22.12 或更高版本。
- **Package Manager**: 偏好使用 `pnpm`。

### 核心命令

- **安裝依賴**: `pnpm install`
- **編譯專案**: `pnpm build` (包含 UI 與插件 SDK 的完整建置)
- **開發模式 (閘道器)**: `pnpm gateway:watch` (原始碼更改時自動重啟)
- **執行 CLI**: `node scripts/run-node.mjs <command>` 或 `pnpm openclaw <command>`
- **建置 UI**: `pnpm ui:build`

### 測試與校驗

- **執行所有測試**: `pnpm test`
- **單元測試**: `vitest run --config vitest.unit.config.ts`
- **端到端測試 (E2E)**: `pnpm test:e2e`
- **Lint 檢查**: `pnpm lint` (使用 `oxlint`)
- **程式碼格式化**: `pnpm format` (使用 `oxfmt`)

## 開發慣例 (Development Conventions)

### 程式碼與文檔風格

- **語言**: 程式碼、註釋、文件及 UI 字串均須使用 **美國英語 (American English)**。
- **命名規範**: 遵循專案現有的 TypeScript 命名慣例。
- **檔案長度**: 每個 TypeScript 檔案建議不超過 500 行 (`pnpm check:loc` 會進行檢查)。

### UI 開發 (Lit)

- **Legacy Decorators**: `ui` 目錄下的 Web 介面使用 Lit 框架，必須使用 **legacy decorators** 風格 (例如 `@state()`, `@property()`)，因建置工具暫不支援標準裝飾器。
- **TS 配置**: `experimentalDecorators: true` 且 `useDefineForClassFields: false`。

### AI 輔助開發

- **標註**: 歡迎使用 AI 輔助生成的 PR，但請在標題或描述中註明。
- **責任**: 作者（或啟動代理的人員）需負責處理/關閉 AI 評論機器人提出的建議。

### 安全與敏感資訊

- **Secrets**: 嚴禁將 API Key 或私密資訊提交至代碼庫。專案使用 `detect-secrets` 進行掃描。
- **CODEOWNERS**: 修改受 `CODEOWNERS` 保護的路徑需經過指定維護者的嚴格評審。

## 目錄結構說明 (Key Directories)

- `src/`: 核心邏輯架構。
  - `gateway/`: 閘道器伺服器實作。
  - `agents/`: 代理執行與邏輯。
  - `channels/`: 通訊頻道基礎設施。
  - `plugin-sdk/`: 提供給擴展功能的開發 SDK。
- `extensions/`: 各種通訊頻道與 AI 模型的插件實作。
- `apps/`: 各平台的原生應用程式源碼。
- `ui/`: Web 控制面板源碼。
- `docs/`: 專案文檔。
- `scripts/`: 開發、建置與自動化腳本。

---

_此檔案由 Gemini CLI 自動生成，作為專案開發的基礎指引。_
