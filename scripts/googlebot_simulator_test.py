import contextlib
from email.message import Message
import io
import unittest
from unittest.mock import patch

from googlebot_simulator import GooglebotSimulator, RobotsTxtMatcher


class RobotsTxtMatcherTests(unittest.TestCase):
    def test_longest_matching_rule_wins_regardless_of_order(self):
        for rules in [
            "Allow: /\nDisallow: /private",
            "Disallow: /private\nAllow: /",
        ]:
            with self.subTest(rules=rules):
                matcher = RobotsTxtMatcher("User-agent: *\n" + rules)
                self.assertFalse(matcher.is_allowed("/private/a"))
                self.assertTrue(matcher.is_allowed("/public"))

    def test_specific_allow_can_override_broader_disallow(self):
        matcher = RobotsTxtMatcher(
            "User-agent: Googlebot\nDisallow: /private\nAllow: /private/public"
        )
        self.assertTrue(matcher.is_allowed("/private/public/a"))
        self.assertFalse(matcher.is_allowed("/private/secret"))

    def test_allow_wins_equal_length_ties(self):
        matcher = RobotsTxtMatcher(
            "User-agent: *\nDisallow: /private\nAllow: /private"
        )
        self.assertTrue(matcher.is_allowed("/private/a"))

    def test_unmatched_paths_are_allowed(self):
        matcher = RobotsTxtMatcher("User-agent: *\nDisallow: /private")
        self.assertTrue(matcher.is_allowed("/public"))

    def test_strict_crawl_does_not_fetch_disallowed_pages(self):
        simulator = GooglebotSimulator("https://example.test", respect_robots=True)
        simulator.robots_matcher = RobotsTxtMatcher(
            "User-agent: *\nAllow: /\nDisallow: /private"
        )
        simulator.sitemap_urls = ["https://example.test/private/a"]
        with (
            patch.object(simulator, "fetch_robots"),
            patch.object(simulator, "discover_sitemap"),
            patch.object(simulator, "_crawl_page", return_value={"links": []}) as crawl,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            simulator.crawl()
        crawl.assert_called_once_with("https://example.test/", 0, False)
        self.assertEqual(simulator.results[-1]["status"], "BLOCKED_BY_ROBOTS")


class IndexabilityTests(unittest.TestCase):
    def crawl_page(self, meta="", headers=()):
        response_headers = Message()
        response_headers["Content-Type"] = "text/html; charset=utf-8"
        for value in headers:
            response_headers["X-Robots-Tag"] = value

        class Response:
            status = 200
            headers = response_headers

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self):
                return f"<html><head>{meta}</head><body>Content</body></html>".encode()

        with (
            patch("googlebot_simulator.urllib.request.urlopen", return_value=Response()),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            simulator = GooglebotSimulator("https://example.test")
            return simulator._crawl_page("https://example.test/", 0, False)

    def assert_non_indexable(self, result):
        self.assertEqual(result["status"], 200)
        self.assertFalse(result["is_indexable"])
        self.assertEqual(result["verdict"], "NON_INDEXABLE")
        self.assertTrue(result["verdict_reasons"])

    def test_meta_noindex_and_none_block_indexing(self):
        for name in ["robots", "GoogleBot"]:
            for content in ["noindex", "NoNe", "follow, NOINDEX"]:
                with self.subTest(name=name, content=content):
                    self.assert_non_indexable(self.crawl_page(
                        f'<meta name="{name}" content="{content}">'
                    ))

    def test_repeated_and_conflicting_meta_tags_keep_restrictive_rule(self):
        for meta in [
            '<meta name="robots" content="noindex"><meta name="robots" content="index">',
            '<meta name="googlebot" content="none"><meta name="googlebot" content="all">',
            '<meta name="googlebot" content="index"><meta name="robots" content="noindex">',
        ]:
            with self.subTest(meta=meta):
                self.assert_non_indexable(self.crawl_page(meta))

    def test_unrestricted_pages_and_other_bots_remain_indexable(self):
        for meta in [
            "",
            '<meta name="robots" content="index, follow">',
            '<meta name="robots" content="all">',
            '<meta name="robots" content="max-image-preview:none">',
            '<meta name="robots">',
            '<meta name="bingbot" content="noindex">',
            '<meta name="googlebot-news" content="noindex">',
        ]:
            with self.subTest(meta=meta):
                result = self.crawl_page(meta)
                self.assertEqual(result["status"], 200)
                self.assertTrue(result["is_indexable"])

    def test_header_noindex_and_none_block_indexing(self):
        for value in ["noindex", "NONE", "googlebot: none", "googlebot: follow, noindex"]:
            with self.subTest(value=value):
                self.assert_non_indexable(self.crawl_page(headers=[value]))

    def test_all_repeated_headers_are_considered(self):
        result = self.crawl_page(headers=["noindex", "follow"])
        self.assert_non_indexable(result)
        self.assertIn("noindex", result["x_robots_tag"])

    def test_header_rules_scoped_to_other_bots_are_ignored(self):
        for headers in [
            ["otherbot: noindex"],
            ["otherbot: nofollow, none"],
            ["googlebot: index, otherbot: noindex"],
            ["otherbot: noindex", "googlebot: index"],
            ["max-image-preview: none"],
        ]:
            with self.subTest(headers=headers):
                self.assertTrue(self.crawl_page(headers=headers)["is_indexable"])

    def test_header_scope_does_not_leak_between_header_fields(self):
        self.assert_non_indexable(self.crawl_page(headers=["otherbot: follow", "none"]))


if __name__ == "__main__":
    unittest.main()
