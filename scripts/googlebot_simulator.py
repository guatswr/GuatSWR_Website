#!/usr/bin/env python3
"""
Googlebot Simulation & SEO Crawler for GuatSWR Website
Simulates Googlebot crawling behavior, link discovery, and page indexability analysis.
"""

import argparse
import collections
import html.parser
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"


def blocks_indexing(value, *, scoped=False):
    """Interpret index restrictions without confusing parameter values with rules."""
    agent = None
    parameterized_rules = {
        "max-snippet", "max-image-preview", "max-video-preview", "unavailable_after"
    }
    for directive in value.lower().split(","):
        directive = directive.strip()
        if scoped and ":" in directive:
            name, content = directive.split(":", 1)
            if name.strip() not in parameterized_rules:
                agent = name.strip()
                directive = content.strip()
        if directive in {"noindex", "none"} and agent in {None, "*", "googlebot"}:
            return True
    return False


class HTMLContentExtractor(html.parser.HTMLParser):
    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url
        self.title = ""
        self.meta_description = ""
        self.meta_robots = ""
        self.meta_googlebot = ""
        self.canonical_url = ""
        self.og_tags = {}
        self.json_ld = []
        self.headings = {"h1": [], "h2": [], "h3": []}
        self.links = []
        self.images = []

        self._in_title = False
        self._in_h1 = False
        self._in_h2 = False
        self._in_h3 = False
        self._in_json_ld = False
        self._current_tag = ""
        self._current_text = []
        self._skip_text_tags = {"script", "style", "noscript", "svg", "template"}
        self._body_text_parts = []
        self._tag_stack = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = {k.lower(): v for k, v in attrs if k}
        self._tag_stack.append(tag.lower())

        if tag.lower() == "title":
            self._in_title = True
        elif tag.lower() == "h1":
            self._in_h1 = True
            self._current_text = []
        elif tag.lower() == "h2":
            self._in_h2 = True
            self._current_text = []
        elif tag.lower() == "h3":
            self._in_h3 = True
            self._current_text = []
        elif tag.lower() == "script" and attrs_dict.get("type") == "application/ld+json":
            self._in_json_ld = True
            self._current_text = []
        elif tag.lower() == "meta":
            name = (attrs_dict.get("name") or "").lower()
            prop = (attrs_dict.get("property") or "").lower()
            content = attrs_dict.get("content") or ""
            if name == "description":
                self.meta_description = content
            elif name == "robots":
                self.meta_robots = ", ".join(filter(None, (self.meta_robots, content)))
            elif name == "googlebot":
                self.meta_googlebot = ", ".join(filter(None, (self.meta_googlebot, content)))
            elif prop.startswith("og:"):
                self.og_tags[prop] = content
        elif tag.lower() == "link":
            rel = attrs_dict.get("rel", "").lower()
            href = attrs_dict.get("href", "")
            if rel == "canonical" and href:
                self.canonical_url = urllib.parse.urljoin(self.base_url, href)
        elif tag.lower() == "a":
            href = attrs_dict.get("href")
            if href:
                clean_href = href.split("#")[0].strip()
                if clean_href and not clean_href.startswith(("mailto:", "tel:", "javascript:")):
                    full_url = urllib.parse.urljoin(self.base_url, clean_href)
                    text = attrs_dict.get("title", "")
                    self.links.append({"href": full_url, "rel": attrs_dict.get("rel", "")})
        elif tag.lower() == "img":
            src = attrs_dict.get("src")
            if src:
                self.images.append({
                    "src": urllib.parse.urljoin(self.base_url, src),
                    "alt": attrs_dict.get("alt", None)
                })

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower in self._tag_stack:
            self._tag_stack.remove(tag_lower)

        if tag_lower == "title":
            self._in_title = False
        elif tag_lower == "h1":
            self._in_h1 = False
            text = " ".join("".join(self._current_text).split())
            if text:
                self.headings["h1"].append(text)
        elif tag_lower == "h2":
            self._in_h2 = False
            text = " ".join("".join(self._current_text).split())
            if text:
                self.headings["h2"].append(text)
        elif tag_lower == "h3":
            self._in_h3 = False
            text = " ".join("".join(self._current_text).split())
            if text:
                self.headings["h3"].append(text)
        elif tag_lower == "script" and self._in_json_ld:
            self._in_json_ld = False
            raw_json = "".join(self._current_text).strip()
            if raw_json:
                try:
                    self.json_ld.append(json.loads(raw_json))
                except Exception:
                    self.json_ld.append(raw_json)

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._in_h1 or self._in_h2 or self._in_h3 or self._in_json_ld:
            self._current_text.append(data)

        # Body readable text collection
        if not any(t in self._skip_text_tags for t in self._tag_stack):
            cleaned = data.strip()
            if cleaned:
                self._body_text_parts.append(cleaned)

    def get_text_snippet(self, max_length=240):
        full_text = " ".join(self._body_text_parts)
        cleaned = re.sub(r"\s+", " ", full_text).strip()
        if len(cleaned) > max_length:
            return cleaned[:max_length] + "..."
        return cleaned

    def get_text_length(self):
        return sum(len(part) for part in self._body_text_parts)


class RobotsTxtMatcher:
    def __init__(self, raw_robots_txt):
        self.disallow_rules = []
        self.allow_rules = []
        self.sitemaps = []
        self.raw = raw_robots_txt
        self._parse(raw_robots_txt)

    def _parse(self, text):
        current_agent_applies = False
        for line in text.splitlines():
            line = line.split("#")[0].strip()
            if not line:
                continue
            if ":" not in line:
                continue
            key, val = [p.strip() for p in line.split(":", 1)]
            key_l = key.lower()
            if key_l == "user-agent":
                agent = val.lower()
                current_agent_applies = (agent in ("*", "googlebot"))
            elif key_l == "sitemap":
                self.sitemaps.append(val)
            elif current_agent_applies:
                if key_l == "disallow":
                    if val:
                        self.disallow_rules.append(val)
                elif key_l == "allow":
                    if val:
                        self.allow_rules.append(val)

    def is_allowed(self, path):
        # Compare both rule types; Allow wins only when specificity is equal.
        allow_length = max(
            (len(rule.encode("utf-8")) for rule in self.allow_rules if path.startswith(rule)),
            default=-1,
        )
        disallow_length = max(
            (len(rule.encode("utf-8")) for rule in self.disallow_rules if path.startswith(rule)),
            default=-1,
        )
        return allow_length >= disallow_length


class GooglebotSimulator:
    def __init__(self, base_url, max_pages=60, max_depth=4, respect_robots=False):
        self.base_url = base_url.rstrip("/")
        self.parsed_base = urllib.parse.urlparse(self.base_url)
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.respect_robots = respect_robots
        self.visited = set()
        self.queue = collections.deque()
        self.results = []
        self.robots_matcher = None
        self.sitemap_urls = []

    def fetch_robots(self):
        robots_url = urllib.parse.urljoin(self.base_url, "/robots.txt")
        print(f"[*] Fetching robots.txt: {robots_url}")
        req = urllib.request.Request(robots_url, headers={"User-Agent": GOOGLEBOT_UA})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                self.robots_matcher = RobotsTxtMatcher(raw)
                print(f"    [+] Disallow rules for Googlebot: {self.robots_matcher.disallow_rules}")
                print(f"    [+] Sitemaps declared: {self.robots_matcher.sitemaps}")
                return raw
        except Exception as e:
            print(f"    [-] Failed to fetch robots.txt: {e}")
            self.robots_matcher = RobotsTxtMatcher("")
            return ""

    def discover_sitemap(self):
        sitemap_endpoint = urllib.parse.urljoin(self.base_url, "/api/__sitemap__/urls")
        print(f"[*] Checking internal sitemap feed: {sitemap_endpoint}")
        req = urllib.request.Request(sitemap_endpoint, headers={"User-Agent": GOOGLEBOT_UA})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for item in data:
                    loc = item.get("loc")
                    if loc:
                        parsed = urllib.parse.urlparse(loc)
                        local_url = urllib.parse.urljoin(self.base_url, parsed.path)
                        self.sitemap_urls.append(local_url)
                print(f"    [+] Discovered {len(self.sitemap_urls)} URLs from sitemap declaration.")
        except Exception as e:
            print(f"    [-] Internal sitemap check: {e}")

    def crawl(self):
        self.fetch_robots()
        self.discover_sitemap()

        # Seed queue with home and sitemap URLs
        initial_urls = [self.base_url + "/"] + self.sitemap_urls
        for u in initial_urls:
            norm = self._normalize_url(u)
            if norm and norm not in self.visited:
                self.queue.append((norm, 0))

        print(f"\n[*] Starting Googlebot simulation crawl on {self.base_url} (Max pages: {self.max_pages})...\n")

        while self.queue and len(self.visited) < self.max_pages:
            current_url, depth = self.queue.popleft()
            if current_url in self.visited:
                continue

            parsed = urllib.parse.urlparse(current_url)
            path = parsed.path or "/"

            # Check robots.txt
            blocked_by_robots = False
            if self.robots_matcher and not self.robots_matcher.is_allowed(path):
                blocked_by_robots = True
                if self.respect_robots:
                    print(f"  [BLOCKED BY ROBOTS.TXT] {path}")
                    self.results.append({
                        "url": current_url,
                        "path": path,
                        "status": "BLOCKED_BY_ROBOTS",
                        "indexable": False,
                        "reason": "Disallowed by robots.txt",
                    })
                    self.visited.add(current_url)
                    continue

            self.visited.add(current_url)
            page_data = self._crawl_page(current_url, depth, blocked_by_robots)
            self.results.append(page_data)

            # Discover links if depth allows
            if depth < self.max_depth and page_data.get("links"):
                for link in page_data["links"]:
                    href = link["href"]
                    norm_link = self._normalize_url(href)
                    if (norm_link and
                        norm_link.startswith(self.base_url) and
                        norm_link not in self.visited and
                        not self._is_excluded_path(norm_link)):
                        self.queue.append((norm_link, depth + 1))

    def _normalize_url(self, raw_url):
        parsed = urllib.parse.urlparse(raw_url)
        if parsed.scheme not in ("http", "https"):
            return None
        # Must match base host or production host
        if parsed.netloc != self.parsed_base.netloc and "guatswr.top" not in parsed.netloc:
            return None
        # Normalize host to local test instance
        path = parsed.path or "/"
        if path.endswith("/") and len(path) > 1:
            path = path.rstrip("/")
        return urllib.parse.urlunparse((self.parsed_base.scheme, self.parsed_base.netloc, path, "", "", ""))

    def _is_excluded_path(self, url):
        parsed = urllib.parse.urlparse(url)
        path = parsed.path
        # Skip static assets or private admin/api paths
        skip_prefixes = ("/api/", "/_nuxt/", "/uploads/", "/admin", "/login")
        return any(path.startswith(prefix) for prefix in skip_prefixes)

    def _crawl_page(self, url, depth, blocked_by_robots):
        parsed = urllib.parse.urlparse(url)
        path = parsed.path or "/"
        print(f"  [Crawling] Depth {depth}: {path}")

        req = urllib.request.Request(url, headers={
            "User-Agent": GOOGLEBOT_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        })

        start_time = time.time()
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                elapsed_ms = round((time.time() - start_time) * 1000, 1)
                status = resp.status
                headers = {k.lower(): v for k, v in resp.headers.items()}
                content_type = headers.get("content-type", "")
                x_robots_values = resp.headers.get_all("X-Robots-Tag", [])
                x_robots_tag = ", ".join(x_robots_values)

                if "text/html" not in content_type:
                    return {
                        "url": url,
                        "path": path,
                        "status": status,
                        "content_type": content_type,
                        "indexable": False,
                        "reason": f"Non-HTML content type: {content_type}"
                    }

                body_bytes = resp.read()
                html_text = body_bytes.decode("utf-8", errors="replace")

                extractor = HTMLContentExtractor(url)
                extractor.feed(html_text)

                # Indexability evaluation
                noindex_in_meta = blocks_indexing(extractor.meta_robots)
                noindex_in_googlebot_meta = blocks_indexing(extractor.meta_googlebot)
                # Each header field starts with an independent user-agent scope.
                noindex_in_header = any(
                    blocks_indexing(value, scoped=True) for value in x_robots_values
                )
                is_indexable = (status == 200 and
                                not noindex_in_meta and
                                not noindex_in_googlebot_meta and
                                not noindex_in_header and
                                not (blocked_by_robots and self.respect_robots))

                verdict_reasons = []
                if blocked_by_robots:
                    verdict_reasons.append("robots.txt: Disallow /")
                if noindex_in_header:
                    verdict_reasons.append(f"X-Robots-Tag: {x_robots_tag}")
                if noindex_in_meta:
                    verdict_reasons.append(f"Meta Robots: {extractor.meta_robots}")
                if noindex_in_googlebot_meta:
                    verdict_reasons.append(f"Meta Googlebot: {extractor.meta_googlebot}")
                if not verdict_reasons:
                    verdict_reasons.append("Indexable (HTML, Status 200, Follow)")

                img_total = len(extractor.images)
                img_missing_alt = sum(1 for img in extractor.images if not img.get("alt"))

                return {
                    "url": url,
                    "path": path,
                    "status": status,
                    "elapsed_ms": elapsed_ms,
                    "html_size_bytes": len(body_bytes),
                    "text_chars": extractor.get_text_length(),
                    "title": extractor.title.strip(),
                    "meta_description": extractor.meta_description.strip(),
                    "meta_robots": extractor.meta_robots,
                    "meta_googlebot": extractor.meta_googlebot,
                    "x_robots_tag": x_robots_tag,
                    "canonical_url": extractor.canonical_url,
                    "h1": extractor.headings["h1"],
                    "h2_count": len(extractor.headings["h2"]),
                    "h2_samples": extractor.headings["h2"][:4],
                    "text_snippet": extractor.get_text_snippet(),
                    "images_count": img_total,
                    "images_missing_alt": img_missing_alt,
                    "open_graph": extractor.og_tags,
                    "json_ld_count": len(extractor.json_ld),
                    "internal_links_count": len(extractor.links),
                    "links": extractor.links,
                    "is_indexable": is_indexable,
                    "verdict": "INDEXABLE" if is_indexable else "NON_INDEXABLE",
                    "verdict_reasons": verdict_reasons
                }

        except urllib.error.HTTPError as e:
            return {
                "url": url,
                "path": path,
                "status": e.code,
                "indexable": False,
                "error": str(e),
                "verdict": "HTTP_ERROR",
                "verdict_reasons": [f"HTTP {e.code}"]
            }
        except Exception as e:
            return {
                "url": url,
                "path": path,
                "status": "ERROR",
                "indexable": False,
                "error": str(e),
                "verdict": "FETCH_FAILED",
                "verdict_reasons": [str(e)]
            }


def generate_report(results, output_json, base_url):
    crawled_pages = [r for r in results if isinstance(r.get("status"), int)]
    indexable_pages = [r for r in results if r.get("is_indexable")]
    non_indexable_pages = [r for r in results if not r.get("is_indexable")]

    summary = {
        "target_origin": base_url,
        "total_crawled": len(results),
        "successful_pages": len(crawled_pages),
        "indexable_pages_count": len(indexable_pages),
        "non_indexable_pages_count": len(non_indexable_pages),
        "pages_missing_h1": [r["path"] for r in crawled_pages if not r.get("h1")],
        "pages_missing_description": [r["path"] for r in crawled_pages if not r.get("meta_description")],
        "pages_missing_title": [r["path"] for r in crawled_pages if not r.get("title")],
        "total_images_analyzed": sum(r.get("images_count", 0) for r in crawled_pages),
        "images_missing_alt": sum(r.get("images_missing_alt", 0) for r in crawled_pages)
    }

    report_payload = {
        "crawl_timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "googlebot_user_agent": GOOGLEBOT_UA,
        "summary": summary,
        "pages": results
    }

    os.makedirs(os.path.dirname(output_json) or ".", exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(report_payload, f, ensure_ascii=False, indent=2)

    return report_payload


def print_cli_summary(report):
    summary = report["summary"]
    pages = report["pages"]

    print("\n" + "=" * 80)
    print(" [Googlebot] 爬虫模拟与搜索引擎可抓取内容分析报告")
    print("=" * 80)
    print(f"目标站点: {summary['target_origin']}")
    print(f"抓取时间: {report['crawl_timestamp']}")
    print(f"爬虫身份: {report['googlebot_user_agent']}")
    print("-" * 80)
    print(f"已抓取页面总数: {summary['total_crawled']}")
    print(f"成功解析页面: {summary['successful_pages']}")
    print(f"当前环境下可索引页面: {summary['indexable_pages_count']}")
    print(f"当前环境下禁止索引页面: {summary['non_indexable_pages_count']}")
    print(f"图片总数: {summary['total_images_analyzed']} (缺失 alt 属性: {summary['images_missing_alt']})")
    print("-" * 80)

    print("\n【页面抓取与内容详情清单】:")
    for idx, p in enumerate(pages, 1):
        path = p.get("path", p.get("url"))
        status = p.get("status")
        title = p.get("title") or "(无 Title)"
        h1 = ", ".join(p.get("h1", [])) or "(无 H1)"
        snippet = p.get("text_snippet") or "(无正文文本)"
        reasons = " | ".join(p.get("verdict_reasons", []))
        chars = p.get("text_chars", 0)
        imgs = p.get("images_count", 0)

        print(f"\n[{idx}] 路径: {path} (HTTP {status})")
        print(f"    标题 (Title)      : {title}")
        print(f"    主标题 (H1)       : {h1}")
        print(f"    字数/图片数       : {chars} 字 | {imgs} 张图片")
        print(f"    搜索引擎指令状态  : {reasons}")
        print(f"    正文摘要 (Snippet): {snippet[:120]}...")
        if p.get("canonical_url"):
            print(f"    规范化链接        : {p.get('canonical_url')}")
    print("\n" + "=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Googlebot Simulator & Content Auditor")
    parser.add_argument("--base-url", default="http://127.0.0.1:3100", help="Target URL (default: http://127.0.0.1:3100)")
    parser.add_argument("--max-pages", type=int, default=50, help="Max pages to crawl")
    parser.add_argument("--max-depth", type=int, default=4, help="Max crawl depth")
    parser.add_argument("--respect-robots", action="store_true", help="Strictly respect robots.txt (will stop if Disallow /)")
    parser.add_argument("--out", default=".tools/googlebot_crawl_report.json", help="Output JSON path")
    args = parser.parse_args()

    simulator = GooglebotSimulator(
        base_url=args.base_url,
        max_pages=args.max_pages,
        max_depth=args.max_depth,
        respect_robots=args.respect_robots
    )
    simulator.crawl()
    report = generate_report(simulator.results, args.out, simulator.base_url)
    print_cli_summary(report)
    print(f"\n[+] 完整爬取报告已保存至: {args.out}\n")

if __name__ == "__main__":
    main()
