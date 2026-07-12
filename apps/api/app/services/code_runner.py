from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
import time
from typing import Any


MAX_CODE_CHARS = 20_000
MAX_TESTS = 30
MAX_TEST_CHARS = 1_000
MAX_OUTPUT_CHARS = 8_000
DEFAULT_TIMEOUT_SECONDS = 3


def normalize_code_tests(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    tests: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        test = item.strip()
        if test:
            tests.append(test[:MAX_TEST_CHARS])
    return tests[:MAX_TESTS]


def code_tests_for_question(content: dict[str, Any] | None, answer_key: dict[str, Any] | None) -> list[str]:
    answer_tests = normalize_code_tests((answer_key or {}).get("tests"))
    if answer_tests:
        return answer_tests
    return normalize_code_tests((content or {}).get("tests"))


def run_python_code(code: str, tests: list[str] | None = None, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    source = (code or "")[:MAX_CODE_CHARS]
    normalized_tests = normalize_code_tests(tests or [])
    payload_json = json.dumps({"code": source, "tests": normalized_tests}, ensure_ascii=False)
    runner_source = textwrap.dedent(
        f"""
        import ast
        import bisect
        import collections
        import contextlib
        import functools
        import heapq
        import io
        import itertools
        import json
        import math
        import operator
        import random
        import re
        import statistics
        import string
        import sys
        import time

        OUTPUT_LIMIT = {MAX_OUTPUT_CHARS}
        payload = json.loads({payload_json!r})
        source = payload.get("code", "")
        tests = payload.get("tests", [])

        blocked_names = {{
            "__import__",
            "breakpoint",
            "compile",
            "delattr",
            "dir",
            "eval",
            "exec",
            "exit",
            "getattr",
            "globals",
            "help",
            "input",
            "locals",
            "memoryview",
            "open",
            "quit",
            "setattr",
            "vars",
        }}
        blocked_modules = {{
            "asyncio",
            "ctypes",
            "multiprocessing",
            "os",
            "pathlib",
            "pickle",
            "shutil",
            "signal",
            "socket",
            "subprocess",
            "sys",
            "threading",
        }}

        class Guard(ast.NodeVisitor):
            def visit_Import(self, node):
                raise ValueError("暂不支持 import，请使用内置函数和已提供的 math/collections 等工具")

            def visit_ImportFrom(self, node):
                raise ValueError("暂不支持 import，请使用内置函数和已提供的 math/collections 等工具")

            def visit_Name(self, node):
                if node.id.startswith("__") or node.id in blocked_names or node.id in blocked_modules:
                    raise ValueError(f"不允许使用 {{node.id}}")
                self.generic_visit(node)

            def visit_Attribute(self, node):
                if node.attr.startswith("__") or node.attr in blocked_names:
                    raise ValueError(f"不允许访问属性 {{node.attr}}")
                self.generic_visit(node)

        safe_builtins = {{
            "abs": abs,
            "all": all,
            "any": any,
            "bool": bool,
            "dict": dict,
            "divmod": divmod,
            "enumerate": enumerate,
            "filter": filter,
            "float": float,
            "int": int,
            "isinstance": isinstance,
            "len": len,
            "list": list,
            "map": map,
            "max": max,
            "min": min,
            "pow": pow,
            "print": print,
            "range": range,
            "reversed": reversed,
            "round": round,
            "set": set,
            "slice": slice,
            "sorted": sorted,
            "str": str,
            "sum": sum,
            "tuple": tuple,
            "zip": zip,
            "Exception": Exception,
            "ValueError": ValueError,
            "TypeError": TypeError,
            "IndexError": IndexError,
            "KeyError": KeyError,
        }}
        env = {{
            "__builtins__": safe_builtins,
            "bisect": bisect,
            "collections": collections,
            "functools": functools,
            "heapq": heapq,
            "itertools": itertools,
            "math": math,
            "operator": operator,
            "random": random,
            "re": re,
            "statistics": statistics,
            "string": string,
        }}

        def output(value):
            text = str(value or "")
            if len(text) <= OUTPUT_LIMIT:
                return text
            return text[:OUTPUT_LIMIT] + "\\n...输出过长，已截断"

        def run_test(raw_test):
            test = str(raw_test or "").strip()
            if not test:
                return {{"test": test, "passed": True, "message": ""}}
            test_tree = ast.parse(test, "<test>", "exec")
            Guard().visit(test_tree)
            try:
                if len(test_tree.body) == 1 and isinstance(test_tree.body[0], ast.Expr):
                    expression = ast.Expression(test_tree.body[0].value)
                    ast.fix_missing_locations(expression)
                    value = eval(compile(expression, "<test>", "eval"), env, env)
                    passed = bool(value)
                    return {{"test": test, "passed": passed, "message": "" if passed else "表达式结果为 False"}}
                exec(compile(test_tree, "<test>", "exec"), env, env)
                return {{"test": test, "passed": True, "message": ""}}
            except AssertionError as exc:
                return {{"test": test, "passed": False, "message": str(exc) or "断言失败"}}
            except Exception as exc:
                return {{"test": test, "passed": False, "message": f"{{type(exc).__name__}}: {{exc}}"}}

        started_at = time.perf_counter()
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()
        result = {{
            "ok": False,
            "passed": False,
            "stdout": "",
            "stderr": "",
            "error": None,
            "tests": [],
            "duration_ms": 0,
        }}

        try:
            tree = ast.parse(source, "<student_code>", "exec")
            Guard().visit(tree)
            with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
                exec(compile(tree, "<student_code>", "exec"), env, env)
                result["tests"] = [run_test(test) for test in tests]
            result["ok"] = True
            result["passed"] = all(item.get("passed") for item in result["tests"]) if tests else True
        except Exception as exc:
            result["error"] = f"{{type(exc).__name__}}: {{exc}}"
        finally:
            result["stdout"] = output(stdout_buffer.getvalue())
            result["stderr"] = output(stderr_buffer.getvalue())
            result["duration_ms"] = int((time.perf_counter() - started_at) * 1000)
            sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False) + "\\n").encode("utf-8"))
            sys.stdout.buffer.flush()
        """
    )

    started_at = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="infuture-code-") as temp_dir:
            completed = subprocess.run(
                [sys.executable, "-I", "-c", runner_source],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_seconds + 1,
                check=False,
            )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "passed": False,
            "stdout": "",
            "stderr": "",
            "error": f"代码运行超时，已在 {timeout_seconds} 秒后停止",
            "tests": [],
            "duration_ms": int((time.perf_counter() - started_at) * 1000),
        }

    raw_output = (completed.stdout or "").strip()
    if raw_output:
        try:
            parsed = json.loads(raw_output.splitlines()[-1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    return {
        "ok": False,
        "passed": False,
        "stdout": raw_output[:MAX_OUTPUT_CHARS],
        "stderr": (completed.stderr or "")[:MAX_OUTPUT_CHARS],
        "error": "代码运行器没有返回有效结果",
        "tests": [],
        "duration_ms": int((time.perf_counter() - started_at) * 1000),
    }
