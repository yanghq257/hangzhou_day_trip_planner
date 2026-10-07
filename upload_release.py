# -*- coding: utf-8 -*-
"""一键上传 APK 到 GitHub Release 并生成下载链接。

用法：
    Windows PowerShell:
        $env:GITHUB_TOKEN = "你的Token"
        python upload_release.py

    macOS / Linux:
        export GITHUB_TOKEN="你的Token"
        python upload_release.py

依赖环境变量（绝不硬编码任何密钥）：
    GITHUB_TOKEN  必需，GitHub 个人访问令牌（需 repo 权限）
    GITHUB_REPO   可选，默认 yanghq257/hangzhou_day_trip_planner
    TAG_NAME      可选，默认 v1.0.0
"""
import os
import sys
import argparse
from urllib.parse import quote

import requests

DEFAULT_REPO = "yanghq257/hangzhou_day_trip_planner"
DEFAULT_APK = "android_app/app/build/outputs/apk/release/app-release.apk"
DEFAULT_TAG = "v1.0.0"
API_BASE = "https://api.github.com"


def main():
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("[ERROR] 请先设置环境变量 GITHUB_TOKEN")
        print("        获取方式：GitHub -> Settings -> Developer settings -> Personal access tokens")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="上传 APK 到 GitHub Release")
    parser.add_argument("apk_path", nargs="?", default=DEFAULT_APK, help="APK 文件路径")
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPO", DEFAULT_REPO))
    parser.add_argument("--tag", default=os.environ.get("TAG_NAME", DEFAULT_TAG))
    parser.add_argument("--name", default=None, help="Release 标题，默认与 tag 相同")
    args = parser.parse_args()

    apk_path = os.path.abspath(args.apk_path)
    if not os.path.isfile(apk_path):
        print("[ERROR] APK 文件不存在：" + apk_path)
        sys.exit(1)

    headers = {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    # 1) 查找或创建 Release
    release = get_release(args.repo, args.tag, headers)
    if release is None:
        release = create_release(args.repo, args.tag, args.name or args.tag, headers)

    release_id = release["id"]
    html_url = release.get("html_url", "")
    upload_base = release["upload_url"].split("{")[0]

    # 2) 上传 APK 资产
    asset_name = os.path.basename(apk_path)
    with open(apk_path, "rb") as f:
        data = f.read()

    up_headers = dict(headers)
    up_headers["Content-Type"] = "application/vnd.android.package-archive"
    resp = requests.post(
        upload_base + "?name=" + quote(asset_name),
        headers=up_headers,
        data=data,
        timeout=180,
    )

    if resp.status_code in (200, 201):
        asset = resp.json()
        print("[OK] 上传成功")
        print("下载链接：" + asset.get("browser_download_url", html_url))
    elif resp.status_code == 422 and "already_exists" in resp.text:
        print("[INFO] 该资产已存在于 Release，未重复上传")
        print("Release 页面：" + (html_url or "https://github.com/" + args.repo + "/releases/tag/" + quote(args.tag, safe="")))
    else:
        print("[ERROR] 上传资产失败：" + str(resp.status_code) + " " + resp.text)
        sys.exit(1)


def get_release(repo, tag, headers):
    url = API_BASE + "/repos/" + repo + "/releases/tags/" + quote(tag, safe="")
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 200:
        return resp.json()
    if resp.status_code == 404:
        return None
    print("[ERROR] 查询 Release 失败：" + str(resp.status_code) + " " + resp.text)
    sys.exit(1)


def create_release(repo, tag, name, headers):
    payload = {
        "tag_name": tag,
        "name": name,
        "body": "Release " + tag + " - 安卓 APK 下载",
        "draft": False,
        "prerelease": False,
    }
    url = API_BASE + "/repos/" + repo + "/releases"
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code not in (200, 201):
        print("[ERROR] 创建 Release 失败：" + str(resp.status_code) + " " + resp.text)
        sys.exit(1)
    print("[INFO] 已创建 Release：" + tag)
    return resp.json()


if __name__ == "__main__":
    main()
