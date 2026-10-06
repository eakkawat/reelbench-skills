#!/usr/bin/env bash
# 把 video-shots 装到 DSH 的 skills 目录（~/.dsh/skills）。
# DSH 只认 <skill 目录>/SKILL.md，所以这里建一个真目录：
#   SKILL.md  ← 复制本仓库的 DSH 适配版 skills/video-shots/SKILL.dsh.md
#   其余全部 ← 软链回仓库，git pull 之后立刻生效
#
#   ./scripts/install-dsh.sh              安装
#   ./scripts/install-dsh.sh --uninstall  删除
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/skills/video-shots"
DST="$HOME/.dsh/skills/video-shots"
LINK_ITEMS=(scripts references examples assets README.md README.zh.md)
uninstall=0

for arg in "$@"; do
  case "$arg" in
    --uninstall) uninstall=1 ;;
    -h|--help)   sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           echo "未知选项 $arg" >&2; exit 1 ;;
  esac
done

if [ "$uninstall" -eq 1 ]; then
  if [ -e "$DST" ] || [ -L "$DST" ]; then rm -rf "$DST"; echo "− $DST"; fi
  exit 0
fi

[ -f "$SRC/SKILL.dsh.md" ] || { echo "✗ 缺 $SRC/SKILL.dsh.md" >&2; exit 1; }

# 依赖自检：缺了也照装，但把话说在前面
missing=()
command -v node >/dev/null 2>&1 || missing+=("node（>= 18）")
command -v ffmpeg >/dev/null 2>&1 || missing+=("ffmpeg")
command -v ffprobe >/dev/null 2>&1 || missing+=("ffprobe")
if [ ${#missing[@]} -gt 0 ]; then
  echo "! 还缺：${missing[*]}　（macOS: brew install node ffmpeg）" >&2
fi

# 只覆盖自己建的东西；用户手放的真目录不动
if [ -e "$DST" ] || [ -L "$DST" ]; then
  if [ -L "$DST" ] || [ -f "$DST/.dsh-installed" ]; then
    rm -rf "$DST"
  else
    echo "✗ $DST 已存在且不是本脚本装的，不动它" >&2
    exit 1
  fi
fi

mkdir -p "$DST"
echo "dsh-installed by scripts/install-dsh.sh" > "$DST/.dsh-installed"
cp "$SRC/SKILL.dsh.md" "$DST/SKILL.md"
echo "✓ $DST/SKILL.md  ←  $SRC/SKILL.dsh.md"

for item in "${LINK_ITEMS[@]}"; do
  [ -e "$SRC/$item" ] || continue
  ln -sfn "$SRC/$item" "$DST/$item"
  echo "✓ $DST/$item → $SRC/$item"
done
