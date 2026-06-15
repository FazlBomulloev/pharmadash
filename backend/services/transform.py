import json
import logging
from collections import defaultdict

log = logging.getLogger(__name__)


def _safe_growth(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return (current - previous) / previous


def build_avp(
    rows: list[dict],
    regions: list[str],
) -> list[dict]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        key = (r.get("mnn_canonical") or r["mnn"], r.get("lf_canonical") or r["lf_avp"])
        groups[key].append(r)

    avp_list: list[dict] = []

    for (mnn, lf_avp), items in groups.items():
        total_usd_y1 = sum(i["usd_y1"] for i in items)
        total_usd_y2 = sum(i["usd_y2"] for i in items)
        total_usd_y3 = sum(i["usd_y3"] for i in items)
        total_un_y1 = sum(i["un_y1"] for i in items)
        total_un_y2 = sum(i["un_y2"] for i in items)
        total_un_y3 = sum(i["un_y3"] for i in items)

        hos_items = [i for i in items if "HOS" in i["sector"]]
        ret_items = [i for i in items if "RET" in i["sector"]]

        hos_usd_y3 = sum(i["usd_y3"] for i in hos_items)
        ret_usd_y3 = sum(i["usd_y3"] for i in ret_items)

        producers_hos = {
            i["producer"] for i in hos_items if i["producer"]
        }
        producers_ret = {
            i["producer"] for i in ret_items if i["producer"]
        }

        region_usd: dict = {}
        region_un: dict = {}
        region_competitors: dict = {}
        region_shares: dict = {}

        for reg in regions:
            reg_items = [i for i in items if i["region"] == reg]
            if not reg_items:
                continue

            reg_hos = [
                i for i in reg_items if "HOS" in i["sector"]
            ]
            reg_ret = [
                i for i in reg_items if "RET" in i["sector"]
            ]

            region_usd[reg] = {
                "hos": {
                    "y1": sum(i["usd_y1"] for i in reg_hos),
                    "y2": sum(i["usd_y2"] for i in reg_hos),
                    "y3": sum(i["usd_y3"] for i in reg_hos),
                },
                "ret": {
                    "y1": sum(i["usd_y1"] for i in reg_ret),
                    "y2": sum(i["usd_y2"] for i in reg_ret),
                    "y3": sum(i["usd_y3"] for i in reg_ret),
                },
            }
            region_un[reg] = {
                "hos": {
                    "y1": sum(i["un_y1"] for i in reg_hos),
                    "y2": sum(i["un_y2"] for i in reg_hos),
                    "y3": sum(i["un_y3"] for i in reg_hos),
                },
                "ret": {
                    "y1": sum(i["un_y1"] for i in reg_ret),
                    "y2": sum(i["un_y2"] for i in reg_ret),
                    "y3": sum(i["un_y3"] for i in reg_ret),
                },
            }

            reg_producers_hos = {
                i["producer"] for i in reg_hos
                if i["producer"]
            }
            reg_producers_ret = {
                i["producer"] for i in reg_ret
                if i["producer"]
            }
            region_competitors[reg] = {
                "hos": len(reg_producers_hos),
                "ret": len(reg_producers_ret),
            }

            reg_usd_y3 = sum(i["usd_y3"] for i in reg_items)
            if total_usd_y3 > 0:
                region_shares[reg] = reg_usd_y3 / total_usd_y3
            else:
                region_shares[reg] = 0.0

        avp_list.append({
            "mnn": mnn,
            "lf_avp": lf_avp,
            "total_usd_y1": total_usd_y1,
            "total_usd_y2": total_usd_y2,
            "total_usd_y3": total_usd_y3,
            "total_un_y1": total_un_y1,
            "total_un_y2": total_un_y2,
            "total_un_y3": total_un_y3,
            "hos_usd_y3": hos_usd_y3,
            "ret_usd_y3": ret_usd_y3,
            "competitors_total": len(producers_hos | producers_ret),
            "competitors_hos": len(producers_hos),
            "competitors_ret": len(producers_ret),
            "usd_growth": _safe_growth(
                total_usd_y3, total_usd_y2
            ),
            "un_growth": _safe_growth(
                total_un_y3, total_un_y2
            ),
            "region_usd_json": json.dumps(region_usd),
            "region_un_json": json.dumps(region_un),
            "region_competitors_json": json.dumps(
                region_competitors
            ),
            "region_shares_json": json.dumps(region_shares),
        })

    log.info("АВП: %d записей из %d строк БДП", len(avp_list), len(rows))
    return avp_list


def build_kap(
    rows: list[dict],
    regions: list[str],
) -> list[dict]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        key = (r.get("mnn_canonical") or r["mnn"], r.get("lf_canonical") or r["lf_avp"])
        groups[key].append(r)

    kap_list: list[dict] = []

    for (mnn, lf_avp), items in groups.items():
        atc = next(
            (i["atc"] for i in items if i.get("atc")),
            None,
        )

        tms_with_sales = {
            i["tm"] for i in items
            if i["tm"] and i["usd_y3"] > 0
        }
        competitors_count = len(tms_with_sales)

        ret_items = [i for i in items if "RET" in i["sector"]]
        hos_items = [i for i in items if "HOS" in i["sector"]]

        tm_usd_ret: dict[str, float] = defaultdict(float)
        for i in ret_items:
            if i["tm"]:
                tm_usd_ret[i["tm"]] += i["usd_y3"]

        tm_usd_total: dict[str, float] = defaultdict(float)
        for i in items:
            if i["tm"]:
                tm_usd_total[i["tm"]] += i["usd_y3"]

        main_ret = (
            max(tm_usd_ret, key=tm_usd_ret.get)
            if tm_usd_ret else None
        )
        main_total = (
            max(tm_usd_total, key=tm_usd_total.get)
            if tm_usd_total else None
        )

        un_hos_y1 = sum(i["un_y1"] for i in hos_items)
        un_hos_y2 = sum(i["un_y2"] for i in hos_items)
        un_hos_y3 = sum(i["un_y3"] for i in hos_items)
        un_ret_y1 = sum(i["un_y1"] for i in ret_items)
        un_ret_y2 = sum(i["un_y2"] for i in ret_items)
        un_ret_y3 = sum(i["un_y3"] for i in ret_items)

        usd_hos_y1 = sum(i["usd_y1"] for i in hos_items)
        usd_hos_y2 = sum(i["usd_y2"] for i in hos_items)
        usd_hos_y3 = sum(i["usd_y3"] for i in hos_items)
        usd_ret_y1 = sum(i["usd_y1"] for i in ret_items)
        usd_ret_y2 = sum(i["usd_y2"] for i in ret_items)
        usd_ret_y3 = sum(i["usd_y3"] for i in ret_items)

        total_un_y2 = un_hos_y2 + un_ret_y2
        total_un_y3 = un_hos_y3 + un_ret_y3
        total_usd_y2 = usd_hos_y2 + usd_ret_y2
        total_usd_y3 = usd_hos_y3 + usd_ret_y3

        un_growth = _safe_growth(total_un_y3, total_un_y2)
        usd_growth = _safe_growth(total_usd_y3, total_usd_y2)

        bg_items = [
            i for i in items
            if i.get("bg_g") == "БГ"
        ]
        g_items = [
            i for i in items
            if i.get("bg_g") == "Г"
        ]
        bg_usd = sum(i["usd_y3"] for i in bg_items)
        g_usd = sum(i["usd_y3"] for i in g_items)

        bg_share = (
            bg_usd / total_usd_y3 if total_usd_y3 > 0 else None
        )

        region_shares: dict[str, float] = {}
        region_competitors: dict[str, dict] = {}

        for reg in regions:
            reg_items = [i for i in items if i["region"] == reg]
            if not reg_items:
                continue

            reg_usd_y3 = sum(i["usd_y3"] for i in reg_items)
            region_shares[reg] = (
                reg_usd_y3 / total_usd_y3
                if total_usd_y3 > 0 else 0.0
            )

            reg_tms_y2 = {
                i["tm"] for i in reg_items
                if i["tm"] and i["usd_y2"] > 0
            }
            reg_tms_y3 = {
                i["tm"] for i in reg_items
                if i["tm"] and i["usd_y3"] > 0
            }
            region_competitors[reg] = {
                "y2": len(reg_tms_y2),
                "y3": len(reg_tms_y3),
            }

        kap_list.append({
            "mnn": mnn,
            "lf_avp": lf_avp,
            "atc": atc,
            "competitors_count": competitors_count,
            "main_competitor_ret": main_ret,
            "main_competitor_total": main_total,
            "un_hos_y1": un_hos_y1,
            "un_hos_y2": un_hos_y2,
            "un_hos_y3": un_hos_y3,
            "un_ret_y1": un_ret_y1,
            "un_ret_y2": un_ret_y2,
            "un_ret_y3": un_ret_y3,
            "usd_hos_y1": usd_hos_y1,
            "usd_hos_y2": usd_hos_y2,
            "usd_hos_y3": usd_hos_y3,
            "usd_ret_y1": usd_ret_y1,
            "usd_ret_y2": usd_ret_y2,
            "usd_ret_y3": usd_ret_y3,
            "un_growth": un_growth,
            "usd_growth": usd_growth,
            "bg_count": len(bg_items),
            "g_count": len(g_items),
            "bg_share": bg_share,
            "region_shares_json": json.dumps(region_shares),
            "region_competitors_json": json.dumps(
                region_competitors
            ),
        })

    log.info("КАП: %d записей из %d строк БДП", len(kap_list), len(rows))
    return kap_list
