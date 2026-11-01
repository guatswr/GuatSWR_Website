import { createError } from 'h3'
import {
  formatResourceSize,
  inferResourceKind,
  joinResourcePath,
  normalizeResourcePath,
} from '../../shared/resources'
import type {
  ResourceDetailResponse,
  ResourceDirectoryResponse,
  ResourceDirectoryStats,
  ResourceItem,
  ResourceSearchResponse,
} from '../../shared/resources'

export interface OpenListRuntimeConfig {
  readonly baseUrl?: string
  readonly publicUrl?: string
  readonly token?: string
  readonly rootPath?: string
  readonly timeoutMs?: number
}

interface OpenListEnvelope<T> {
  readonly code: number
  readonly message: string
  readonly data: T
}

interface OpenListRawFsItem {
  readonly name: string
  readonly size: number
  readonly is_dir: boolean
  readonly modified: string
  readonly created?: string
  readonly sign?: string
  readonly thumb?: string
  readonly type?: number
  readonly provider?: string
  readonly raw_url?: string
}

interface OpenListListData {
  readonly content: readonly OpenListRawFsItem[] | null
  readonly total: number
  readonly readme: string
  readonly header?: string
  readonly write: boolean
  readonly provider: string
}

interface OpenListGetData extends OpenListRawFsItem {
  readonly raw_url: string
  readonly readme: string
  readonly provider: string
}

interface OpenListSearchItem {
  readonly parent: string
  readonly name: string
  readonly is_dir: boolean
  readonly size: number
  readonly type?: number
}

interface OpenListSearchData {
  readonly content: readonly OpenListSearchItem[] | null
  readonly total: number
}

interface MockDirectoryNode {
  readonly path: string
  readonly provider: string
  readonly modified: string
  readonly summary: string
  readonly badge?: string
  readonly header: string
  readonly readme: string
  readonly items: readonly ResourceItem[]
}

const MOCK_TEXT_PREVIEWS: Readonly<Record<string, string>> = Object.freeze({
  '/幻想乡书库借阅指南.md': `# 桂航绯想天 · 幻想乡书库借阅指南

欢迎来到桂航绯想天社区资源中心（OpenList 节点）。本中心收录社团日常联机、STG 练习、线下例会与二创所需的常用工具及归档卷宗。

## 1. 常用分区速览
- **非想天则联机专区**：提供开箱即用的 \`th123_v1.10a\` 整合包，内置 \`GIuRoll\` 回滚网络插件与字体修复。
- **东方STG正作与补丁**：收录 \`Thprac\` 全正作练习器、\`vpatch\` 低延迟补丁与社团悬赏通关 Replay。
- **幻想乡音律馆**：社团成员同人编曲 Demo、例会暖场无损歌单与 MIDI 扒谱工程。
- **红魔馆大书库**：一设考据文献、求闻史纪摘录与社团视觉徽章矢量素材。

## 2. 下载与校验建议
1. 大体积整合包推荐使用 **aria2c**、**IDM** 或支持断点续传的客户端拉取。
2. 解压 \`.7z\` 卷宗请使用 **7-Zip 23.01+** 或 **Bandizip**，避免中文路径乱码。
3. 下载完成后可比对详情抽屉中的 \`SHA-256\` 校验值确保压缩包完整无损。`,

  '/OpenList_WebDAV挂载配置说明.json': JSON.stringify(
    {
      service: 'GUAT-SWR OpenList Resource Hub',
      api_version: 'OpenList / AList v3',
      endpoints: {
        list: 'POST /api/fs/list',
        get: 'POST /api/fs/get',
        search: 'POST /api/fs/search',
        webdav: 'https://pan.guatswr.top/dav/',
      },
      mount_guide: {
        windows_rclone: 'rclone mount guatswr-openlist:/ Z: --vfs-cache-mode writes',
        potplayer_playlist: '支持通过 WebDAV 直链加载幻想乡音律馆无损曲目与活动录像',
      },
    },
    null,
    2,
  ),

  '/非想天则联机专区/天则回滚补丁_GIuRoll_配置参考.ini': `; ============================================================================
; 东方非想天则 GIuRoll (Rollback Netcode) 社团推荐配置参考
; 放置于游戏根目录 configex123.ini / GIuRoll.ini
; ============================================================================
[Network]
EnableRollback=1
DefaultDelay=2
MaxRollbackFrames=6
ShowPingOverlay=1
AutoDetectNAT=1

[Lobby]
ServerHost=soku.guatswr.top:10800
DefaultNickname=GUAT_Player
AllowSpectator=1

[Video]
Windowed=1
KeepAspectRatio=1
VSync=0`,

  '/非想天则联机专区/回滚与联机插件/SokuDirectIP_端口映射排查说明.md': `# 非想天则联机端口映射与 NAT 穿透排查

当使用传统 Direct IP 或宿管内网联机遇到 \`Cannot connect to host\` 时，请按以下步骤排查：

1. **推荐首选**：使用根目录整合包内置的 **GIuRoll 0.6.14**，支持 UDP 打洞与延迟回滚，跨网联机无需手动映射端口。
2. **校园网同网段直连**：
   - 主机（Host）在防火墙放行 \`th123.exe\` 的 **UDP 10800** 端口。
   - 查看本机校园网内网 IP（通常为 \`10.x.x.x\` 或 \`172.16.x.x\`），直接发给群友连入。
3. **帧数不稳处理**：笔记本玩家请在显卡控制面板中将 \`th123.exe\` 强制指定为独显运行，并关闭垂直同步。`,

  '/东方STG正作与补丁/Thcrap_汉化按需更新配置.json': JSON.stringify(
    {
      console: false,
      dat_dump: false,
      patches: [
        { archive: 'repos/nmlgc/base_tsa/' },
        { archive: 'repos/nmlgc/base_tasofro/' },
        { archive: 'repos/thpatch/lang_zh-hans/' },
      ],
      game_support: ['th06', 'th07', 'th08', 'th10', 'th11', 'th12', 'th15', 'th18', 'th19'],
    },
    null,
    2,
  ),
})

const MOCK_DIRECTORIES: Readonly<Record<string, MockDirectoryNode>> = Object.freeze({
  '/': {
    path: '/',
    provider: 'OpenList · 博丽大结界主节点',
    modified: '2026-10-28T20:30:00+08:00',
    summary: '幻想乡书库根目录',
    header: '欢迎访问桂航绯想天社区资源中心。所有社团共享整合包、补丁、无损试听与例会资料均按专题归档。',
    readme: `### 使用说明
- 点击文件夹名称进入目录，使用上方路径导航返回上级或根目录。
- 点击文件可打开详情与文本预览。真实文件开放下载后，可在详情中获取下载链接和校验信息。
- 当前为演示书库，示例整合包不提供真实下载。可浏览文件夹、预览示例文档并查看文件信息。`,
    items: [
      {
        name: '非想天则联机专区',
        path: '/非想天则联机专区',
        is_dir: true,
        size: 0,
        modified: '2026-10-28T21:15:00+08:00',
        type: 1,
        kind: 'folder',
        provider: 'OpenList · Local NVMe',
        summary: '12.3 完整联机整合包、GIuRoll 回滚网络补丁、帧数表与按键配置工具',
        badge: '热门置顶',
      },
      {
        name: '东方STG正作与补丁',
        path: '/东方STG正作与补丁',
        is_dir: true,
        size: 0,
        modified: '2026-10-26T19:40:00+08:00',
        type: 1,
        kind: 'folder',
        provider: 'OpenList · Local NVMe',
        summary: 'Thprac 万能练习器、vpatch 低延迟补丁、Thcrap 汉化与社团悬赏通关 Replay',
        badge: '核心工具',
      },
      {
        name: '同人音乐与东方编曲',
        path: '/同人音乐与东方编曲',
        is_dir: true,
        size: 0,
        modified: '2026-10-22T18:10:00+08:00',
        type: 1,
        kind: 'folder',
        provider: 'OpenList · OneDrive 镜像',
        summary: '社团同好原创编曲 Demo、线下例会精选无损歌单与 ZUN 原曲 MIDI 工程',
        badge: 'FLAC / MIDI',
      },
      {
        name: '文献设定与二创素材',
        path: '/文献设定与二创素材',
        is_dir: true,
        size: 0,
        modified: '2026-10-19T15:20:00+08:00',
        type: 1,
        kind: 'folder',
        provider: 'OpenList · S3 对象存储',
        summary: '求闻史纪考据笔记、ZUN 访谈汇编、社团矢量徽章与海报排版素材包',
        badge: '考据与视觉',
      },
      {
        name: '社团档案与例会资料',
        path: '/社团档案与例会资料',
        is_dir: true,
        size: 0,
        modified: '2026-10-25T22:00:00+08:00',
        type: 1,
        kind: 'folder',
        provider: 'OpenList · Local NVMe',
        summary: '历届例会幻灯片、新歓东方入坑导览手册、线下比赛规则与活动纪念册',
        badge: '社团公开',
      },
      {
        name: '幻想乡书库借阅指南.md',
        path: '/幻想乡书库借阅指南.md',
        is_dir: false,
        size: 3840,
        modified: '2026-10-28T20:00:00+08:00',
        type: 4,
        kind: 'document',
        provider: 'OpenList · Local NVMe',
        summary: '社区资源中心目录结构、下载工具推荐与压缩包校验说明',
        badge: '必读指南',
        version: 'v2.4',
        sha256: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      },
      {
        name: 'OpenList_WebDAV挂载配置说明.json',
        path: '/OpenList_WebDAV挂载配置说明.json',
        is_dir: false,
        size: 1620,
        modified: '2026-10-27T11:30:00+08:00',
        type: 4,
        kind: 'code',
        provider: 'OpenList · Local NVMe',
        summary: '使用 rclone / RaiDrive / PotPlayer 挂载社团 OpenList 书库的配置模板',
        version: 'v1.0',
        sha256: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      },
    ],
  },

  '/非想天则联机专区': {
    path: '/非想天则联机专区',
    provider: 'OpenList · Local NVMe',
    modified: '2026-10-28T21:15:00+08:00',
    summary: '东方非想天则 (Touhou Hisoutensoku 12.3) 联机整合与对战插件库',
    header: '本专区提供桂航绯想天日常群内联机统一标准版本（v1.10a + GIuRoll 回滚补丁），解压即玩，无需单独安装绯想天本体。',
    readme: `### 非想天则联机快速上手
1. 下载 **\`[桂航绯想天] 东方非想天则_v1.10a_联机完整整合包.7z\`** 并解压至**纯英文或无特殊符号路径**。
2. 首次启动请运行根目录下的 \`SokuLauncher.exe\` 或直接带插件启动 \`th123.exe\`。
3. 群内约战默认开启 **GIuRoll 回滚联机**，校园网或跨运营商均可流畅直连。`,
    items: [
      {
        name: '回滚与联机插件',
        path: '/非想天则联机专区/回滚与联机插件',
        is_dir: true,
        size: 0,
        modified: '2026-10-27T18:20:00+08:00',
        type: 1,
        kind: 'folder',
        provider: 'OpenList · Local NVMe',
        summary: 'GIuRoll、SokuRoll、SokuLobby 独立更新包与端口穿透说明',
        badge: '插件目录',
      },
      {
        name: '[桂航绯想天] 东方非想天则_v1.10a_联机完整整合包.7z',
        path: '/非想天则联机专区/[桂航绯想天] 东方非想天则_v1.10a_联机完整整合包.7z',
        is_dir: false,
        size: 1_142_947_840,
        modified: '2026-10-28T21:15:00+08:00',
        type: 0,
        kind: 'archive',
        provider: 'OpenList · Local NVMe',
        summary: '含绯想天全角色解锁存档、1.10a 升级补丁、GIuRoll 0.6.14 回滚与受身计时器插件',
        badge: '社团标准包',
        version: 'v1.10a-2026.10',
        sha256: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
      },
      {
        name: 'SokuPractice_非想天则受身与连段练习器_v2.3.zip',
        path: '/非想天则联机专区/SokuPractice_非想天则受身与连段练习器_v2.3.zip',
        is_dir: false,
        size: 14_826_496,
        modified: '2026-10-16T14:10:00+08:00',
        type: 0,
        kind: 'game',
        provider: 'OpenList · Local NVMe',
        summary: '支持判定框显示（Hitbox Viewer）、帧数差提示、版边固连录制与地面受身方向随机训练',
        badge: '进阶必备',
        version: 'v2.3.1',
        sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      },
      {
        name: '非想天则全角色帧数表与灵力磨血速查手册.pdf',
        path: '/非想天则联机专区/非想天则全角色帧数表与灵力磨血速查手册.pdf',
        is_dir: false,
        size: 18_452_000,
        modified: '2026-09-30T20:05:00+08:00',
        type: 4,
        kind: 'document',
        provider: 'OpenList · Local NVMe',
        summary: '涵盖 20 名角色拳脚发生帧、硬直差、无敌帧分布与常见连段正误压制表',
        badge: '攻略文献',
        version: '2026 秋季修订版',
        sha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
      },
      {
        name: '天则回滚补丁_GIuRoll_配置参考.ini',
        path: '/非想天则联机专区/天则回滚补丁_GIuRoll_配置参考.ini',
        is_dir: false,
        size: 2048,
        modified: '2026-10-20T16:45:00+08:00',
        type: 4,
        kind: 'code',
        provider: 'OpenList · Local NVMe',
        summary: '针对校园网与跨网对局调优的 GIuRoll 默认回滚帧数与显示参数配置',
        version: 'v0.6.14',
        sha256: 'e7f6c011776e8db7cd330b54174fd76f7d0216b612387a5ffcfb81e6f0919683',
      },
    ],
  },

  '/非想天则联机专区/回滚与联机插件': {
    path: '/非想天则联机专区/回滚与联机插件',
    provider: 'OpenList · Local NVMe',
    modified: '2026-10-27T18:20:00+08:00',
    summary: '独立联机模块与回滚插件更新包',
    header: '已安装旧版天则的社员可仅下载此目录内的独立插件覆盖至 SWRSToys 文件夹。',
    readme: '将插件 `.dll` 放入 `modules/` 并在 `SWRSToys.ini` 中取消对应行的分号注释即可启用。',
    items: [
      {
        name: 'GIuRoll_v0.6.14_Standalone_CN.zip',
        path: '/非想天则联机专区/回滚与联机插件/GIuRoll_v0.6.14_Standalone_CN.zip',
        is_dir: false,
        size: 6_482_112,
        modified: '2026-10-27T18:20:00+08:00',
        type: 0,
        kind: 'game',
        provider: 'OpenList · Local NVMe',
        summary: '新一代非想天则回滚联机模块（汉化界面版），支持观战重连与延迟曲线显示',
        badge: '推荐更新',
        version: 'v0.6.14',
        sha256: '7902699be42c8a8e46fbbb4501726517e86b22c56a189f7625a6da49081b2451',
      },
      {
        name: 'SokuDirectIP_端口映射排查说明.md',
        path: '/非想天则联机专区/回滚与联机插件/SokuDirectIP_端口映射排查说明.md',
        is_dir: false,
        size: 2910,
        modified: '2026-10-12T10:00:00+08:00',
        type: 4,
        kind: 'document',
        provider: 'OpenList · Local NVMe',
        summary: '校园网内网直连、防火墙 UDP 10800 放行与显卡独显绑定教程',
        version: 'v1.2',
        sha256: '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fdefb64a3',
      },
    ],
  },

  '/东方STG正作与补丁': {
    path: '/东方STG正作与补丁',
    provider: 'OpenList · Local NVMe',
    modified: '2026-10-26T19:40:00+08:00',
    summary: '东方 Project 整数作 STG 实用补丁、练习器与社团通关录像库',
    header: '收录红魔乡 (TH06) 至兽王园 (TH19) 的通用练习工具、输入延迟优化补丁及社团成员高分/LNN 录像。',
    readme: `### STG 补丁使用提示
- **Thprac**：单文件绿色版，启动后会自动识别当前正在运行的东方正作进程，按 \`Backspace\` 或 \`F12\` 呼出选关与道中节点菜单。
- **VsyncPatch (vpatch)**：显著降低红魔乡、妖妖梦、永夜抄、风神录在现代 Windows 11 系统下的输入延迟。`,
    items: [
      {
        name: '社团悬赏Replay归档',
        path: '/东方STG正作与补丁/社团悬赏Replay归档',
        is_dir: true,
        size: 0,
        modified: '2026-10-26T19:40:00+08:00',
        type: 1,
        kind: 'folder',
        provider: 'OpenList · Local NVMe',
        summary: '桂航绯想天活动中心「悬赏令」与「STG 大会」认证通关 Replay 录像合集',
        badge: '机签录像',
      },
      {
        name: 'thprac_v2.2.1.4_全正作通用练习器.exe',
        path: '/东方STG正作与补丁/thprac_v2.2.1.4_全正作通用练习器.exe',
        is_dir: false,
        size: 9_842_688,
        modified: '2026-10-24T20:12:00+08:00',
        type: 0,
        kind: 'game',
        provider: 'OpenList · Local NVMe',
        summary: '支持 TH06–TH19 任意章节、道中节点、Boss 符卡单练与满 Power/残机锁定',
        badge: 'STG 必备',
        version: 'v2.2.1.4',
        sha256: '19581e27de7ced00ff1ce50b2047e7a567c76b1cbaebabe5ef03f7c3017bb5b7',
      },
      {
        name: 'VsyncPatch_rev7_旧作至星莲船低延迟补丁合集.7z',
        path: '/东方STG正作与补丁/VsyncPatch_rev7_旧作至星莲船低延迟补丁合集.7z',
        is_dir: false,
        size: 4_521_984,
        modified: '2026-09-18T17:30:00+08:00',
        type: 0,
        kind: 'archive',
        provider: 'OpenList · Local NVMe',
        summary: '修复 TH06–TH12 窗口化帧率失控与垂直同步输入延迟，附带预设 vpatch.ini',
        badge: '低延迟优化',
        version: 'rev7',
        sha256: '4a44dc15364204a80fe80e9039455cc1608281820fe2b24f1e5233ade6af1dd5',
      },
      {
        name: 'Thcrap_东方通用在线汉化与Mod加载器.zip',
        path: '/东方STG正作与补丁/Thcrap_东方通用在线汉化与Mod加载器.zip',
        is_dir: false,
        size: 16_252_928,
        modified: '2026-10-08T13:15:00+08:00',
        type: 0,
        kind: 'archive',
        provider: 'OpenList · Local NVMe',
        summary: 'Touhou Community Reliant Automatic Patcher，免修改原版主程序挂载简中汉化与弹幕高亮',
        version: '2026.10',
        sha256: '4fc82b26aecb47d2868c4efbe3581732a3e7cbcc6c2efb32062c08170a05eeb8',
      },
      {
        name: 'Thcrap_汉化按需更新配置.json',
        path: '/东方STG正作与补丁/Thcrap_汉化按需更新配置.json',
        is_dir: false,
        size: 1024,
        modified: '2026-10-08T13:20:00+08:00',
        type: 4,
        kind: 'code',
        provider: 'OpenList · Local NVMe',
        summary: '预设挂载 thpatch 简体中文语言包与基础 TSA/Tasofro 引擎修复的配置文件',
        version: 'v1.0',
        sha256: '6b51d431df5d7f141cbececcf79edf3dd861c3b4069f0b11661a3eefacbba918',
      },
    ],
  },

  '/东方STG正作与补丁/社团悬赏Replay归档': {
    path: '/东方STG正作与补丁/社团悬赏Replay归档',
    provider: 'OpenList · Local NVMe',
    modified: '2026-10-26T19:40:00+08:00',
    summary: '社团成员通关录像与大会决赛 Replay 存档',
    header: '将 `.rpy` 文件放入对应正作的 `replay/` 目录下即可在游戏内 Replay 菜单观看路线规划。',
    readme: '欢迎社员向管理员投递自己的首通 1cc、Extra 击破或 Lunatic 悬赏 Replay 永久入库！',
    items: [
      {
        name: 'th11_ud01_地灵殿_Lunatic_灵梦A_NoBomb通关.rpy',
        path: '/东方STG正作与补丁/社团悬赏Replay归档/th11_ud01_地灵殿_Lunatic_灵梦A_NoBomb通关.rpy',
        is_dir: false,
        size: 128_400,
        modified: '2026-10-26T19:40:00+08:00',
        type: 0,
        kind: 'game',
        provider: 'OpenList · Local NVMe',
        summary: '2026 秋季社团悬赏令达成录像 · 安定打法与五面猫车走位示范',
        badge: '悬赏达成',
        version: 'TH11 v1.00a',
      },
      {
        name: 'th08_ud02_永夜抄_Extra_结界组_全符卡收取.rpy',
        path: '/东方STG正作与补丁/社团悬赏Replay归档/th08_ud02_永夜抄_Extra_结界组_全符卡收取.rpy',
        is_dir: false,
        size: 94_208,
        modified: '2026-10-14T22:10:00+08:00',
        type: 0,
        kind: 'game',
        provider: 'OpenList · Local NVMe',
        summary: '永夜抄 Extra 道中满点路线 + 妹红全符卡安定收取教学 Replay',
        badge: '路线教学',
        version: 'TH08 v1.00d',
      },
    ],
  },

  '/同人音乐与东方编曲': {
    path: '/同人音乐与东方编曲',
    provider: 'OpenList · OneDrive 镜像',
    modified: '2026-10-22T18:10:00+08:00',
    summary: '幻想乡音律馆：社团同好编曲、例会 BGM 选集与扒谱工程',
    header: '收录社团内部音乐同好制作的东方 Arrange 试听、线下茶会背景音乐歌单及原曲 MIDI 学习资料。',
    readme: '所有商业同人社团作品仅保留曲目索引与例会试听导览，请支持正版同人展会与数字专辑发售。',
    items: [
      {
        name: '[桂航绯想天同好编曲] 碎月_Acoustic_TeaParty_Arrange.flac',
        path: '/同人音乐与东方编曲/[桂航绯想天同好编曲] 碎月_Acoustic_TeaParty_Arrange.flac',
        is_dir: false,
        size: 38_420_600,
        modified: '2026-10-22T18:10:00+08:00',
        type: 3,
        kind: 'audio',
        provider: 'OpenList · OneDrive 镜像',
        summary: '2026 秋季例会开场曲 · 木吉他与长笛二重奏改编（24bit / 48kHz 无损）',
        badge: '社团原创',
        version: 'FLAC 24bit',
        sha256: '3fdba35f04dc8c462986c992bcf875546257113072a909c162f7e470e581e278',
      },
      {
        name: '[桂航绯想天同好编曲] 亡き王女の為のセプテット_Piano_Solo.mp3',
        path: '/同人音乐与东方编曲/[桂航绯想天同好编曲] 亡き王女の為のセプテット_Piano_Solo.mp3',
        is_dir: false,
        size: 11_240_000,
        modified: '2026-09-29T21:00:00+08:00',
        type: 3,
        kind: 'audio',
        provider: 'OpenList · OneDrive 镜像',
        summary: '亡女七重奏钢琴独奏实录版 · 社团迎新晚会节目音源备份',
        badge: '320kbps',
      },
      {
        name: '东方旧作至虹龙洞_原曲主旋律与和弦走向_MIDI学习集.zip',
        path: '/同人音乐与东方编曲/东方旧作至虹龙洞_原曲主旋律与和弦走向_MIDI学习集.zip',
        is_dir: false,
        size: 29_184_512,
        modified: '2026-08-15T16:00:00+08:00',
        type: 0,
        kind: 'archive',
        provider: 'OpenList · OneDrive 镜像',
        summary: '供东方二创编曲入门分析 ZUN 氏小号配器、贝斯行进与五声音阶转调的 MIDI 参考包',
        badge: '编曲教材',
      },
    ],
  },

  '/文献设定与二创素材': {
    path: '/文献设定与二创素材',
    provider: 'OpenList · S3 对象存储',
    modified: '2026-10-19T15:20:00+08:00',
    summary: '红魔馆大书库：设定考据、期刊文献与社团视觉设计素材',
    header: '为东方考据党、文作部与美工组准备的参考资料库，包含社团标准徽章与宣发排版模板。',
    readme: '使用社团徽章与字体素材制作线下展架、吧唧或传单时，请遵循《桂航绯想天视觉规范》中的留白与色彩要求。',
    items: [
      {
        name: '桂航绯想天_社团视觉徽章与印章矢量素材包_SVG_PNG.zip',
        path: '/文献设定与二创素材/桂航绯想天_社团视觉徽章与印章矢量素材包_SVG_PNG.zip',
        is_dir: false,
        size: 45_612_032,
        modified: '2026-10-19T15:20:00+08:00',
        type: 5,
        kind: 'image',
        provider: 'OpenList · S3 对象存储',
        summary: '含社团校徽融合版 Logo、朱印章纹、博丽大结界几何底纹（SVG / 300DPI 透明 PNG）',
        badge: '官方VI',
        version: 'v2.0',
      },
      {
        name: '幻想乡编年史与一设考据读书笔记汇编_2026版.pdf',
        path: '/文献设定与二创素材/幻想乡编年史与一设考据读书笔记汇编_2026版.pdf',
        is_dir: false,
        size: 32_890_880,
        modified: '2026-09-10T19:00:00+08:00',
        type: 4,
        kind: 'document',
        provider: 'OpenList · S3 对象存储',
        summary: '基于《东方求闻史纪》《求闻口授》《香霖堂》整理的幻想乡地理、结界史与符卡规则考据',
        badge: '考据精编',
      },
    ],
  },

  '/社团档案与例会资料': {
    path: '/社团档案与例会资料',
    provider: 'OpenList · Local NVMe',
    modified: '2026-10-25T22:00:00+08:00',
    summary: '绯想天社团公开卷宗：例会讲义、新歓题卷与赛事手册',
    header: '记录桂航绯想天历次线下聚会、新生入坑科普讲座幻灯片与联机赛事规程。',
    readme: '往期活动的图文报道与现场照片请前往「往期活动回顾 (/activities)」页面翻阅。',
    items: [
      {
        name: '2026秋季招新例会_走进幻想乡_东方Project全方位导览.pdf',
        path: '/社团档案与例会资料/2026秋季招新例会_走进幻想乡_东方Project全方位导览.pdf',
        is_dir: false,
        size: 64_172_032,
        modified: '2026-10-25T22:00:00+08:00',
        type: 4,
        kind: 'document',
        provider: 'OpenList · Local NVMe',
        summary: '面向零基础新社员的东方正作历史、音乐魅力、非想天则与桂航同好会社团活动介绍 PPT 导出卷',
        badge: '新人推荐',
        version: '2026 秋',
      },
      {
        name: '桂航绯想天_东方浓度趣味测试卷（迎新茶会版含解析）.pdf',
        path: '/社团档案与例会资料/桂航绯想天_东方浓度趣味测试卷（迎新茶会版含解析）.pdf',
        is_dir: false,
        size: 12_582_912,
        modified: '2026-10-18T20:30:00+08:00',
        type: 4,
        kind: 'document',
        provider: 'OpenList · Local NVMe',
        summary: '分为「红魔馆常识题」「天则老中医题」「ZUN 啤酒考据题」三档难度的线下互动试题与答案详解',
        badge: '茶会题卷',
      },
      {
        name: '桂林高校东方联合例会_非想天则瑞士轮与STG赛制手册.pdf',
        path: '/社团档案与例会资料/桂林高校东方联合例会_非想天则瑞士轮与STG赛制手册.pdf',
        is_dir: false,
        size: 8_912_896,
        modified: '2026-09-25T18:00:00+08:00',
        type: 4,
        kind: 'document',
        provider: 'OpenList · Local NVMe',
        summary: '桂航 × 桂电 × 联外东方同好线下交流赛裁判规则、禁卡/选图约定与赛程模板',
        badge: '赛事规程',
      },
    ],
  },
})

function computeMockStats(): ResourceDirectoryStats {
  let totalFiles = 0
  let totalFolders = 0
  let totalSize = 0
  for (const dir of Object.values(MOCK_DIRECTORIES)) {
    for (const item of dir.items) {
      if (item.is_dir) totalFolders += 1
      else {
        totalFiles += 1
        totalSize += item.size
      }
    }
  }
  return { totalFiles, totalFolders, totalSize }
}

const GLOBAL_MOCK_STATS = computeMockStats()

function resolveUpstreamPath(rootPath: string | undefined, clientPath: string): string {
  const normalizedClient = normalizeResourcePath(clientPath)
  const normalizedRoot = normalizeResourcePath(rootPath || '/')
  if (normalizedRoot === '/') return normalizedClient
  return normalizedClient === '/' ? normalizedRoot : `${normalizedRoot}${normalizedClient}`
}

function buildDirectDownloadUrl(
  baseUrl: string,
  publicUrl: string | undefined,
  upstreamPath: string,
  rawUrl?: string,
  sign?: string,
): string {
  if (rawUrl && /^https?:\/\//i.test(rawUrl)) return rawUrl
  const origin = (publicUrl?.trim() || baseUrl.trim()).replace(/\/+$/, '')
  const encodedPath = upstreamPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
  const query = sign ? `?sign=${encodeURIComponent(sign)}` : ''
  return `${origin}/d${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}${query}`
}

async function callOpenListApi<T>(
  config: OpenListRuntimeConfig,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    throw new Error('OpenList baseUrl is not configured')
  }
  const timeoutMs = config.timeoutMs ?? 8_000
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  if (config.token && config.token.trim()) {
    headers.Authorization = config.token.trim()
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `OpenList upstream HTTP ${response.status}`,
    })
  }

  const payload = (await response.json()) as OpenListEnvelope<T>
  if (!payload || typeof payload.code !== 'number' || payload.code !== 200) {
    throw createError({
      statusCode: payload?.code === 404 ? 404 : 502,
      statusMessage: payload?.message || 'OpenList upstream returned an error',
    })
  }

  return payload.data
}

/**
 * List a directory from OpenList v3 (`/api/fs/list`) when configured, or fall
 * back to the built-in Touhou club mock resource catalog.
 */
export async function listOpenListDirectory(
  config: OpenListRuntimeConfig,
  rawPath: string | undefined,
  page = 1,
  perPage = 100,
  refresh = false,
): Promise<ResourceDirectoryResponse> {
  const path = normalizeResourcePath(rawPath)
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '')

  if (baseUrl) {
    const upstreamPath = resolveUpstreamPath(config.rootPath, path)
    const data = await callOpenListApi<OpenListListData>(config, '/api/fs/list', {
      path: upstreamPath,
      password: '',
      page,
      per_page: perPage,
      refresh,
    })

    const rawItems = Array.isArray(data.content) ? data.content : []
    const items: ResourceItem[] = rawItems.map((entry) => {
      const itemPath = joinResourcePath(path, entry.name)
      const itemUpstreamPath = joinResourcePath(upstreamPath, entry.name)
      const kind = inferResourceKind(entry.name, entry.is_dir, entry.type)
      return {
        name: entry.name,
        path: itemPath,
        is_dir: Boolean(entry.is_dir),
        size: Number(entry.size ?? 0),
        modified: entry.modified || '',
        ...(entry.created ? { created: entry.created } : {}),
        ...(entry.sign ? { sign: entry.sign } : {}),
        ...(entry.thumb ? { thumb: entry.thumb } : {}),
        ...(typeof entry.type === 'number' ? { type: entry.type } : {}),
        kind,
        provider: entry.provider || data.provider || 'OpenList',
        ...(!entry.is_dir
          ? {
              raw_url: buildDirectDownloadUrl(
                baseUrl,
                config.publicUrl,
                itemUpstreamPath,
                entry.raw_url,
                entry.sign,
              ),
            }
          : {}),
      }
    })

    let totalFiles = 0
    let totalFolders = 0
    let totalSize = 0
    for (const item of items) {
      if (item.is_dir) totalFolders += 1
      else {
        totalFiles += 1
        totalSize += item.size
      }
    }

    return {
      path,
      readme: data.readme || '',
      header: data.header || '',
      provider: data.provider || 'OpenList v3',
      total: Number(data.total ?? items.length),
      write: Boolean(data.write),
      source: 'openlist',
      openlistPublicUrl: (config.publicUrl || baseUrl).replace(/\/+$/, ''),
      items,
      stats: { totalFiles, totalFolders, totalSize },
    }
  }

  // Built-in Mock Fallback
  const dir = Object.hasOwn(MOCK_DIRECTORIES, path) ? MOCK_DIRECTORIES[path] : undefined
  if (!dir) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Resource directory not found',
    })
  }

  const items: ResourceItem[] = dir.items.map(item => ({
    ...item,
    ...(!item.is_dir
      ? {
          raw_url: `/api/resources/detail?path=${encodeURIComponent(item.path)}&download=1`,
        }
      : {}),
  }))

  return {
    path: dir.path,
    readme: dir.readme,
    header: dir.header,
    provider: dir.provider,
    total: items.length,
    write: false,
    source: 'mock',
    items,
    stats: GLOBAL_MOCK_STATS,
  }
}

/**
 * Retrieve a single file or folder detail from OpenList v3 (`/api/fs/get`) or
 * the built-in mock catalog.
 */
export async function getOpenListResourceDetail(
  config: OpenListRuntimeConfig,
  rawPath: string | undefined,
): Promise<ResourceDetailResponse> {
  const path = normalizeResourcePath(rawPath)
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '')

  if (baseUrl) {
    const upstreamPath = resolveUpstreamPath(config.rootPath, path)
    const data = await callOpenListApi<OpenListGetData>(config, '/api/fs/get', {
      path: upstreamPath,
      password: '',
    })

    const kind = inferResourceKind(data.name, data.is_dir, data.type)
    const rawUrl = buildDirectDownloadUrl(
      baseUrl,
      config.publicUrl,
      upstreamPath,
      data.raw_url,
      data.sign,
    )

    const item: ResourceItem = {
      name: data.name,
      path,
      is_dir: Boolean(data.is_dir),
      size: Number(data.size ?? 0),
      modified: data.modified || '',
      ...(data.created ? { created: data.created } : {}),
      ...(data.sign ? { sign: data.sign } : {}),
      ...(data.thumb ? { thumb: data.thumb } : {}),
      ...(typeof data.type === 'number' ? { type: data.type } : {}),
      kind,
      provider: data.provider || 'OpenList',
      raw_url: rawUrl,
    }

    return {
      item,
      raw_url: rawUrl,
      readme: data.readme || '',
      provider: data.provider || 'OpenList v3',
      source: 'openlist',
    }
  }

  // Search for the item across mock directories
  for (const dir of Object.values(MOCK_DIRECTORIES)) {
    const found = dir.items.find(entry => entry.path === path)
    if (found) {
      const rawUrl = `/api/resources/detail?path=${encodeURIComponent(found.path)}&download=1`
      const preview = Object.hasOwn(MOCK_TEXT_PREVIEWS, found.path)
        ? MOCK_TEXT_PREVIEWS[found.path]
        : undefined
      return {
        item: { ...found, raw_url: rawUrl },
        raw_url: rawUrl,
        readme: dir.readme,
        provider: found.provider || dir.provider,
        source: 'mock',
        ...(preview ? { textPreview: preview } : {}),
      }
    }
  }

  throw createError({
    statusCode: 404,
    statusMessage: 'Resource item not found',
  })
}

/**
 * Search across OpenList (`/api/fs/search`) or recursively across the mock tree.
 */
export async function searchOpenListResources(
  config: OpenListRuntimeConfig,
  rawKeywords: string | undefined,
  rawParent = '/',
  page = 1,
): Promise<ResourceSearchResponse> {
  const parent = normalizeResourcePath(rawParent)
  const keywords = (rawKeywords || '').trim().slice(0, 80)
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '')

  if (!keywords) {
    return { parent, keywords: '', total: 0, source: baseUrl ? 'openlist' : 'mock', items: [] }
  }

  if (baseUrl) {
    const upstreamParent = resolveUpstreamPath(config.rootPath, parent)
    const data = await callOpenListApi<OpenListSearchData>(config, '/api/fs/search', {
      parent: upstreamParent,
      keywords,
      scope: 0,
      page,
      per_page: 50,
      password: '',
    })

    const rawItems = Array.isArray(data.content) ? data.content : []
    const root = normalizeResourcePath(config.rootPath || '/')
    const items: ResourceItem[] = rawItems.filter((entry) => {
      const entryParent = normalizeResourcePath(entry.parent || upstreamParent)
      return root === '/' || entryParent === root || entryParent.startsWith(`${root}/`)
    }).map((entry) => {
      const upstreamEntryParent = normalizeResourcePath(entry.parent || upstreamParent)
      const publicParent = root === '/' ? upstreamEntryParent : normalizeResourcePath(upstreamEntryParent.slice(root.length))
      const itemPath = joinResourcePath(publicParent, entry.name)
      const kind = inferResourceKind(entry.name, entry.is_dir, entry.type)
      return {
        name: entry.name,
        path: itemPath,
        is_dir: Boolean(entry.is_dir),
        size: Number(entry.size ?? 0),
        modified: '',
        ...(typeof entry.type === 'number' ? { type: entry.type } : {}),
        kind,
        provider: 'OpenList',
        summary: `位于 ${publicParent}`,
      }
    })

    return {
      parent,
      keywords,
      total: Number(data.total ?? items.length),
      source: 'openlist',
      items,
    }
  }

  // Recursive search over mock directories
  const needle = keywords.toLowerCase()
  const matched: ResourceItem[] = []
  const seen = new Set<string>()

  for (const dir of Object.values(MOCK_DIRECTORIES)) {
    if (parent !== '/' && dir.path !== parent && !dir.path.startsWith(`${parent}/`)) continue
    for (const item of dir.items) {
      if (seen.has(item.path)) continue
      const haystack = `${item.name} ${item.summary || ''} ${item.badge || ''} ${item.path}`.toLowerCase()
      if (haystack.includes(needle)) {
        seen.add(item.path)
        matched.push({
          ...item,
          ...(!item.is_dir
            ? {
                raw_url: `/api/resources/detail?path=${encodeURIComponent(item.path)}&download=1`,
              }
            : {}),
        })
      }
    }
  }

  return {
    parent,
    keywords,
    total: matched.length,
    source: 'mock',
    items: matched.slice((page - 1) * 50, page * 50),
  }
}

/** Generate a descriptive placeholder download payload when clicking download in mock mode. */
export function buildMockDownloadReceipt(item: ResourceItem): string {
  return [
    '========================================================================',
    '  桂航绯想天 · 社区资源中心 (OpenList 演示节点卷宗凭条)',
    '========================================================================',
    `卷宗名称: ${item.name}`,
    `书库路径: ${item.path}`,
    `卷宗大小: ${formatResourceSize(item.size, item.is_dir)} (${item.size} bytes)`,
    `更新时间: ${item.modified}`,
    `存储节点: ${item.provider || 'OpenList Mock Node'}`,
    ...(item.version ? [`版本标记: ${item.version}`] : []),
    ...(item.sha256 ? [`SHA-256 : ${item.sha256}`] : []),
    '',
    '说明: 当前站点处于 OpenList 演示节点模式 (source = mock)。',
    '在部署环境中配置 NUXT_OPENLIST_BASE_URL 后，本链接将直接指向 OpenList 真实文件直链 (/d/...)。',
    '========================================================================',
    '',
  ].join('\r\n')
}
