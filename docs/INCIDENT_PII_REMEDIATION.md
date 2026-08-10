# 隐私事件处置记录（不含任何个人信息）

> 本记录不复述、恢复或收集事故中的任何姓名、出生日期、精确时间、地点或坐标。它只记录处置边界、可验证状态和仍需外部平台完成的工作。

## 事件边界

曾有真实个人出生信息被错误用作公开示例输入，并进入源码历史和已撤下的分发物。这不是普通版本更新：重新发布新包不能覆盖旧对象、缓存或已下载副本，因此先停止公开分发，再处理当前仓库与可达历史。

## 已完成的仓库侧处置

1. 仓库保持 **private**；没有新的 Release、tag 或公开安装链接。
2. 已删除受影响的 GitHub Releases、资产和远端 tag。
3. 当前源码只保留明确标注为 synthetic / 虚构 / 非真实人物的示例和测试夹具；排盘算法、facts、schema、ruleset、引擎数值与依赖锁未被这次处置修改。
4. 以已脱敏的工作树建立新的单根提交并替换 `main`。新克隆只含这一条可达提交；旧事故历史不再由仓库分支、tag 或 Release 引用。
5. 增加长期门禁：
   - `scan:incident` 从 gitignored 的受控本地 token 文件读取禁用字段；不会输出字段值。
   - `pnpm run verify:all` 在本地把 `scan:incident` 接在 `verify:cloud` 后面；缺 token 必须 fail-closed。
   - `pnpm run scan:incident:history` 只用于受控环境的全部当前可达历史检查。
   - `incident-guard` 要求 shipped 示例和固定测试夹具标注为合成数据。
6. 根安装清单当前明确处于 `unpublished`：Qoder、WorkBuddy 和豆包没有可下载的 ZIP、URL 或 SHA-256；安装器必须停止，而不是把 404 当作安装成功。

## 如实的验证边界

| 检查                          | 当前可如实声明的结论                                            |
| ----------------------------- | --------------------------------------------------------------- |
| 新克隆可达历史                | 仅新的单根 `main`；旧历史不再由远端 refs 可达                   |
| Release / tag                 | 均为 0                                                          |
| 当前安装入口                  | 无公开宿主 ZIP；候选构建仅供本地离线验证                        |
| `pnpm run verify:cloud`       | 不含事故 token 的 CI 门禁；应在本地和 GitHub Actions 通过       |
| `pnpm run verify:all`         | 只有受控 token 文件存在时才可能通过；缺失时必须非零 fail-closed |
| `scan:incident` / `--history` | 不在没有受控 token 的环境中伪造“0 命中”结论                     |

## 仍无法靠仓库技术手段保证删除的内容

- 已下载的 clone、离线备份、第三方镜像或任何曾经取得内容的人；
- GitHub 的旧不可达对象在平台垃圾回收前可能仍可通过直接 SHA 请求；
- CDN、缓存、搜索索引和此前 Release 资产的存储副本；
- 与旧提交关联的 GitHub Actions 历史日志。

这些项目需要 GitHub Support 和相关外部平台处理。仓库操作只能切断 GitHub 仓库当前可达历史，不能宣称互联网范围内已经彻底删除。

## 重新公开前的条件

1. GitHub Support 已收到敏感数据移除请求，并给出可执行的处置/确认；
2. 再次核对仓库为 private 期间的 `main`、branches、tags、Releases、forks、Pages、artifacts 和 packages；
3. 在受控环境运行 `pnpm run verify:all` 与 `pnpm run scan:incident:history`；
4. 确认根安装清单仍不把未发布 ZIP 说成已发布；
5. 先公开源码/Codex 入口，三种桌面端 ZIP 另行以全新未使用 tag 发布、重新下载校验后再 promote。

## GitHub Support 工单草稿（不填入 PII）

> Subject: Sensitive data removal and purge of unreachable objects — private repository `Jowitt13/loom-of-heaven`
>
> Repository: `Jowitt13/loom-of-heaven` (currently private).
>
> An individual's birth data was accidentally committed as example/demo input and reached the public default branch, historical source tags, and Release ZIP assets. We are deliberately not including the values in this request.
>
> Repository-side remediation completed:
>
> - Set the repository to private.
> - Deleted affected Releases, assets and tags.
> - Replaced the default branch with a single sanitized root commit; a fresh clone has one reachable commit and no release/tag refs.
> - Added fail-closed local incident scanning and synthetic-example guards.
>
> Please:
>
> 1. Purge or expedite garbage collection for old unreachable commit objects and stale cached views.
> 2. Confirm deletion/retention handling for deleted Release assets and CDN/storage caches.
> 3. Advise on Actions logs tied to old commits and any search-index/cache removal steps.
> 4. Confirm whether any forks retain the affected objects (our repository-side check found none).
>
> We can provide the specific values through an approved private support channel if required; we will not place them in repository files, tickets, logs or attachments.
