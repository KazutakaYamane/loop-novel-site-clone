"""バージョン制約(npm と Composer)を区間に直し、ある制約が別の制約の範囲に収まるかを判定する。

guard ジョブが、composer.json と package.json の制約が scripts/loop/dependencies.md の制約の範囲内かを確かめるのに使う。
対応する書式: *、x、^、~、=、>、>=、<、<=、1.2.x、1.2.*、ハイフン範囲、AND(空白・カンマ)、OR(|| と Composer の |)。
それ以外(git の URL、file:、npm:、dev-master など)は Unparseable として扱い、許可しない。
"""

from __future__ import annotations

import re

Version = tuple[int, int, int]
INF: Version = (10**9, 0, 0)
ZERO: Version = (0, 0, 0)
Interval = tuple[Version, Version]  # [下限, 上限) の半開区間


class Unparseable(ValueError):
    pass


PART = re.compile(r"^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:\.\d+)?(?:[-+][0-9A-Za-z.\-+]*)?$")


def _parts(text: str) -> list[int | None]:
    m = PART.match(text)
    if not m:
        raise Unparseable(f"not a version: {text!r}")
    out: list[int | None] = []
    for g in m.groups():
        if g is None:
            break
        if g in ("x", "X", "*"):
            out.append(None)
            break
        out.append(int(g))
    return out


def _floor(parts: list[int | None]) -> Version:
    nums = [p for p in parts if p is not None]
    nums += [0] * (3 - len(nums))
    return (nums[0], nums[1], nums[2])


def _bump(parts: list[int], index: int) -> Version:
    nums = list(parts) + [0] * (3 - len(parts))
    nums[index] += 1
    for i in range(index + 1, 3):
        nums[i] = 0
    return (nums[0], nums[1], nums[2])


def _wild(parts: list[int | None]) -> Interval:
    """1.2.x や 1.2(npm)のように、書かれていない部分を任意とする範囲。"""
    fixed = [p for p in parts if p is not None][:3]
    if not fixed:
        return (ZERO, INF)
    return (_floor(list(fixed)), _bump(fixed, len(fixed) - 1))


def _caret(parts: list[int | None]) -> Interval:
    fixed = [p for p in parts if p is not None]
    if not fixed:
        return (ZERO, INF)
    lo = _floor(fixed)
    padded = fixed + [0] * (3 - len(fixed))
    # 最初の 0 でない桁を上げる。書かれた桁がすべて 0 なら、書かれた最後の桁を上げる
    for i in range(min(len(fixed), 3)):
        if padded[i] != 0:
            return (lo, _bump(padded, i))
    return (lo, _bump(padded, min(len(fixed), 3) - 1))


def _tilde(parts: list[int | None], eco: str) -> Interval:
    fixed = [p for p in parts if p is not None]
    if not fixed:
        return (ZERO, INF)
    lo = _floor(fixed)
    padded = fixed + [0] * (3 - len(fixed))
    if eco == "composer":
        # Composer: ~1.2 は >=1.2 <2.0、~1.2.3 は >=1.2.3 <1.3.0、~1 は >=1 <2
        idx = max(0, min(len(fixed), 3) - 2)
        return (lo, _bump(padded, idx))
    # npm: ~1.2.3 と ~1.2 は <1.3.0、~1 は <2.0.0
    return (lo, _bump(padded, 0 if len(fixed) == 1 else 1))


def _exact(parts: list[int | None], eco: str) -> Interval:
    if None in parts or (eco == "npm" and len(parts) < 3):
        return _wild(parts)
    fixed = [p for p in parts if p is not None]
    lo = _floor(fixed)
    return (lo, _bump(list(lo), 2))


def _comparator(token: str, eco: str) -> Interval:
    m = re.match(r"^(\^|~>?|>=|<=|>|<|==?|!=)?\s*(.+)$", token)
    if not m:
        raise Unparseable(token)
    op, ver = m.group(1) or "", m.group(2)
    parts = _parts(ver)
    if op == "^":
        return _caret(parts)
    if op.startswith("~"):
        return _tilde(parts, eco)
    if op in ("", "=", "=="):
        return _exact(parts, eco)
    if op == "!=":
        raise Unparseable("!= is not supported")
    lo = _floor(parts)
    if op == ">=":
        return (lo, INF)
    if op == ">":
        return (_exact(parts, eco)[1], INF)
    if op == "<":
        return (ZERO, lo)
    if op == "<=":
        return (ZERO, _exact(parts, eco)[1])
    raise Unparseable(token)


def _intersect(a: Interval, b: Interval) -> Interval:
    return (max(a[0], b[0]), min(a[1], b[1]))


def parse(constraint: str, eco: str) -> list[Interval]:
    """制約を区間の和(OR)にする。空の区間は落とす。"""
    text = constraint.strip()
    if eco == "composer":
        text = re.sub(r"@(dev|alpha|beta|RC|stable)\b", "", text, flags=re.I)
    if text in ("", "*", "x", "X"):
        return [(ZERO, INF)]
    if re.search(r"[:/#]|^dev-|\.x-dev$|^(latest|next|workspace|file|link|git)", text):
        raise Unparseable(f"unsupported constraint {constraint!r}")
    alternatives = re.split(r"\s*\|\|?\s*", text)
    result: list[Interval] = []
    for alt in alternatives:
        alt = alt.strip()
        if not alt:
            raise Unparseable(constraint)
        hyphen = re.match(r"^(\S+)\s+-\s+(\S+)$", alt)
        if hyphen:
            upper = _parts(hyphen.group(2))
            # 上限の書かれていない桁は任意(1.0 - 2.3 は <2.4.0)
            hi = _wild(upper)[1] if len(upper) < 3 or None in upper else _bump([p or 0 for p in upper], 2)
            interval: Interval = (_floor(_parts(hyphen.group(1))), hi)
        else:
            # 演算子と版の間の空白を詰めてから、空白とカンマで AND に分ける
            alt = re.sub(r"(\^|~>?|>=|<=|>|<|==?)\s+", r"\1", alt)
            interval = (ZERO, INF)
            for token in re.split(r"\s*,\s*|\s+", alt):
                interval = _intersect(interval, _comparator(token, eco))
        if interval[0] < interval[1]:
            result.append(interval)
    if not result:
        raise Unparseable(f"empty range {constraint!r}")
    return result


def is_subset(declared: str, allowed: str, eco: str) -> bool:
    """declared が許す版がすべて allowed の範囲に入っていれば True。"""
    allowed_ranges = parse(allowed, eco)
    for lo, hi in parse(declared, eco):
        if not any(a_lo <= lo and hi <= a_hi for a_lo, a_hi in allowed_ranges):
            return False
    return True
