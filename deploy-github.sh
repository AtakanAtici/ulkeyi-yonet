#!/bin/sh
# GitHub Pages'e yayınlar. Önce bir kez: gh auth login
set -e
REPO="${1:-ulkeyi-yonet}"
OWNER="$(gh api user -q .login)"
if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --source . --remote origin --push --description "Ülkeyi Yönet — ekonomi simülasyonu oyunu"
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
fi
# Pages'i main dalının kökünden aç (zaten açıksa hata verme)
gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 || true
echo "Yayın adresi: https://$(echo "$OWNER" | tr '[:upper:]' '[:lower:]').github.io/$REPO/"
echo "İlk yayın 1-2 dakika sürebilir."
