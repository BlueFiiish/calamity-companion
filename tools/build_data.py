#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the Terraria Calamity Companion datasets from raw Cargo pulls.

Input  (tools/raw/):  recipes.json, classsetups.json, drops.json
Output (data/):       items.json, classes.json, bosses.json, meta.json

No network access (Norton-safe). Run pull_cargo.ps1 first to refresh raw/.
"""
import json, re, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.abspath(os.path.join(HERE, "..", "data"))
SEP = "‡"  # double dagger, the ingredient field separator

WIKI = "https://calamitymod.wiki.gg"

def load(name):
    with open(os.path.join(RAW, name), "r", encoding="utf-8") as f:
        return json.load(f)

def canon(name):
    """Canonical item name. Cargo encodes piped links [[Target|Display]] as
    'Target¦Display' (broken-bar). Keep the link Target."""
    if name is None:
        return ""
    return name.split("¦")[0].strip()

def slugify(name):
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")

def sprite_url(filename):
    # MediaWiki filenames cannot contain ':' -> drop it (do NOT %3A-encode it).
    fn = filename.split("¦")[0]
    fn = fn.replace(":", "").replace(" ", "_")
    from urllib.parse import quote
    return f"{WIKI}/wiki/Special:FilePath/{quote(fn)}"

# ---- wikitext helpers -------------------------------------------------------
FILE_RE = re.compile(r"\[\[File:([^|\]]+?\.png)", re.IGNORECASE)
LINK_RE = re.compile(r"\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]")

def first_file(wikitext):
    m = FILE_RE.search(wikitext or "")
    return m.group(1).strip() if m else None

def first_link_text(wikitext):
    # return the displayed target of the first non-File wikilink
    for m in LINK_RE.finditer(wikitext or ""):
        tgt = m.group(1).strip()
        if tgt.lower().startswith("file:"):
            continue
        return tgt
    return None

def clean_inline(wikitext):
    """Strip wikitext/HTML from a short cell (drop chance or amount) to readable text."""
    if not wikitext:
        return ""
    t = str(wikitext)
    # decode the entities the API double-encoded (&amp;#32; etc.)
    t = t.replace("&amp;", "&")
    t = t.replace("&#32;", " ").replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&#160;", " ")
    # expert / rev / death indicators -> annotate
    t = re.sub(r"<abbr[^>]*title=\"Expert Mode\"[^>]*>(.*?)</abbr>", r"\1 (Expert)", t, flags=re.DOTALL)
    t = re.sub(r"<abbr[^>]*title=\"Revengeance Mode\"[^>]*>(.*?)</abbr>", r"\1 (Rev)", t, flags=re.DOTALL)
    t = re.sub(r"<abbr[^>]*title=\"Death Mode\"[^>]*>(.*?)</abbr>", r"\1 (Death)", t, flags=re.DOTALL)
    t = re.sub(r"<span class=\"i\">.*?</span>", "", t, flags=re.DOTALL)
    t = re.sub(r"\[\[File:[^\]]*\]\]", "", t)
    t = t.replace("<br/>", " / ").replace("<br>", " / ").replace("<br />", " / ")
    # [[Target|Display]] -> Display ; [[Target]] -> Target
    t = re.sub(r"\[\[[^\]|]*\|([^\]]+)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]|]+)\]\]", r"\1", t)
    t = re.sub(r"<[^>]+>", "", t)                 # any remaining tags
    t = t.replace("'''", "").replace("''", "")
    t = re.sub(r"\s+/\s+", " / ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip(" /")

# backward-compatible alias
clean_chance = clean_inline

def clean_npc(wikitext):
    """Return a short readable source string, primary NPC first."""
    if not wikitext:
        return ""
    # drop File markup (map icons etc.)
    t = re.sub(r"\[\[File:[^\]]*\]\]", "", wikitext)
    names = [m.group(1).strip() for m in LINK_RE.finditer(t) if not m.group(1).lower().startswith("file:")]
    # remove html + brackets leftovers for context words (e.g. "Post-")
    ctx = re.sub(r"\[\[[^\]]*\]\]", "", t)
    ctx = re.sub(r"<[^>]+>", " ", ctx)
    ctx = re.sub(r"[\r\n]+", " ", ctx)
    ctx = re.sub(r"\s+", " ", ctx).strip()
    if names:
        primary = names[0]
        return primary
    return ctx

def primary_npc_name(wikitext):
    if not wikitext:
        return ""
    t = re.sub(r"\[\[File:[^\]]*\]\]", "", wikitext)
    for m in LINK_RE.finditer(t):
        if not m.group(1).lower().startswith("file:"):
            return m.group(1).strip()
    return ""

# ---- parse recipes ----------------------------------------------------------
def parse_ings(ings):
    """'‡Name‡2^‡Other‡8' -> [(name, qty), ...]"""
    out = []
    if not ings:
        return out
    for chunk in ings.split("^"):
        parts = [p for p in chunk.split(SEP) if p != ""]
        if not parts:
            continue
        if len(parts) == 1:
            out.append((canon(parts[0]), 1))
        else:
            name = canon(parts[0])
            qty_raw = parts[-1].strip()
            try:
                qty = int(re.sub(r"[^0-9]", "", qty_raw) or "1")
            except ValueError:
                qty = 1
            out.append((name, qty))
    return out

def main():
    recipes = load("recipes.json")
    classsetups = load("classsetups.json")
    drops = load("drops.json")

    items = {}   # name -> node
    sprite_map = {}  # name -> explicit sprite filename (from wikitext File: tags)

    def ensure(name):
        name = canon(name)
        if not name:
            return None
        if name not in items:
            items[name] = {
                "id": slugify(name),
                "name": name,
                "img": None,          # filled at end
                "recipes": [],        # [{station, amount, ings:[[name,qty],...]}]
                "shimmer": [],        # shimmer transmutations (NOT real crafting; excluded from tree)
                "usedIn": [],         # [names] that craft with this
                "drops": [],          # [{npc, chance, amount}]
                "classes": [],        # [melee, ranged, ...]
                "stages": [],         # progression stages it appears in
                "types": [],          # classsetup type buckets (weapon/armor/accessory/...)
            }
        return items[name]

    # Shimmer transmutations are item->item swaps, NOT crafting. Including them as
    # recipes fabricates nonsense trees (a mined pre-HM ore "crafted" from endgame
    # materials), so they are stored separately and excluded from the tree + usedIn.
    SHIMMER = {"Shimmer Transmutation", "Shimmer"}

    # recipes
    n_recipes = 0
    n_shimmer = 0
    for r in recipes:
        if str(r.get("historical", "")).strip() in ("1", "true", "True", "yes"):
            continue
        result = canon(r.get("result") or "")
        if not result:
            continue
        station = (r.get("station") or "").strip()
        ings = parse_ings(r.get("ings") or "")
        node = ensure(result)
        try:
            amount = int(re.sub(r"[^0-9]", "", str(r.get("amount") or "1")) or "1")
        except ValueError:
            amount = 1
        rec = {"station": station, "amount": amount,
               "ings": [[nm, q] for nm, q in ings]}
        if r.get("resultimage"):
            fn = r["resultimage"].strip()
            if fn.lower().endswith(".png"):
                sprite_map.setdefault(result, fn)
        if station in SHIMMER:
            node["shimmer"].append(rec)
            n_shimmer += 1
            for nm, q in ings:
                ensure(nm)  # register node, but no crafting edge
            continue
        node["recipes"].append(rec)
        n_recipes += 1
        for nm, q in ings:
            ing_node = ensure(nm)
            if result not in ing_node["usedIn"]:
                ing_node["usedIn"].append(result)

    # drops
    for d in drops:
        item = canon(d.get("Item") or "")
        if not item:
            continue
        node = ensure(item)
        node["drops"].append({
            "npc": clean_npc(d.get("Npc")),
            "chance": clean_inline(d.get("Chance")),
            "amount": clean_inline(d.get("Amount") or "1") or "1",
        })

    # class setups -> item tagging + class guide structure
    CLASS_MAP = {
        "melee": ["melee"], "ranged": ["ranged"], "magic": ["mage"],
        "rogue": ["rogue"], "summon": ["summoner"],
        "all": ["melee", "ranged", "mage", "summoner", "rogue"],
        "all-but-stealth": ["melee", "ranged", "mage", "summoner"],
        "all-but-summoner": ["melee", "ranged", "mage", "rogue"],
        "all-but-summoner-stealth": ["melee", "ranged", "mage"],
    }
    TYPE_BUCKET = {
        "armor": "armor",
        "weapon": "weapons", "weaponspam": "weapons", "weaponstealth": "weapons", "weaponsummon": "weapons",
        "minions": "weapons", "sentries": "weapons", "ammo": "ammo",
    }
    def bucket_for(t):
        tl = (t or "").lower()
        if tl in TYPE_BUCKET:
            return TYPE_BUCKET[tl]
        if tl.startswith("accessor"):
            return "accessories"
        if tl.startswith("buff") or tl == "support":
            return "buffs"
        return "other"

    STAGE_ORDER = [
        ("pre-boss", "Pre-Bosses"),
        ("pre-evil1", "Pre-Evil Boss"),
        ("pre-evil2", "Post-Evil Boss"),
        ("pre-skeletron", "Pre-Skeletron"),
        ("pre-wof", "Pre-Wall of Flesh"),
        ("pre-mech", "Pre-Mechs"),
        ("pre-mech1", "Post-First Mech"),
        ("pre-mech2", "Post-Two Mechs"),
        ("pre-plantera", "Pre-Plantera"),
        ("pre-golem", "Pre-Golem"),
        ("post-golem", "Post-Golem"),
        ("pre-lunar", "Pre-Lunar Events"),
        ("pre-moonlord", "Pre-Moon Lord"),
        ("pre-provi", "Pre-Providence"),
        ("pre-polter", "Pre-Polterghast"),
        ("pre-dog", "Pre-Devourer of Gods"),
        ("pre-yharon", "Pre-Yharon"),
        ("pre-exo", "Pre-Exo Mechs / Calamitas"),
        ("pre-scal", "Pre-Supreme Calamitas"),
        ("pre-scal-exo", "Pre-Supreme Calamitas (Exo)"),
        ("endgame", "Endgame (Post-Supreme Calamitas)"),
    ]
    STAGE_LABEL = dict(STAGE_ORDER)
    STAGE_INDEX = {k: i for i, (k, _) in enumerate(STAGE_ORDER)}

    classes = {c: {"label": c.capitalize() if c != "mage" else "Mage", "stages": {}}
               for c in ["melee", "ranged", "mage", "summoner", "rogue"]}
    classes["mage"]["label"] = "Mage"
    classes["summoner"]["label"] = "Summoner"

    for row in classsetups:
        prog = (row.get("progression") or "").strip()
        if prog not in STAGE_INDEX:
            continue
        cls_code = (row.get("class") or "").strip().lower()
        cls_list = CLASS_MAP.get(cls_code)
        if not cls_list:
            continue
        typ = (row.get("type") or "").strip()
        bucket = bucket_for(typ)
        item_wt = row.get("item") or ""
        name = canon(first_link_text(item_wt) or "")
        if not name:
            continue
        fil = first_file(item_wt)
        if fil:
            sprite_map.setdefault(name, fil)
        node = ensure(name)
        for c in cls_list:
            if c not in node["classes"]:
                node["classes"].append(c)
        if prog not in node["stages"]:
            node["stages"].append(prog)
        if bucket not in node["types"] and bucket != "other":
            node["types"].append(bucket)
        for c in cls_list:
            st = classes[c]["stages"].setdefault(prog, {"armor": [], "weapons": [], "accessories": [], "buffs": [], "ammo": [], "other": []})
            entry = {"name": name, "type": typ}
            if entry not in st[bucket]:
                st[bucket].append(entry)

    # finalize sprites
    for name, node in items.items():
        fn = sprite_map.get(name, name + ".png")
        node["img"] = sprite_url(fn)
        # obtain classification
        node["craftable"] = len(node["recipes"]) > 0
        node["dropped"] = len(node["drops"]) > 0

    # ---- build classes.json ordered ----
    classes_out = {}
    for c, data in classes.items():
        stage_list = []
        for key, idx in sorted(((k, STAGE_INDEX[k]) for k in data["stages"]), key=lambda x: x[1]):
            groups = data["stages"][key]
            # attach sprites
            def enrich(lst):
                out = []
                for e in lst:
                    nm = e["name"]
                    img = items[nm]["img"] if nm in items else sprite_url(nm + ".png")
                    out.append({"name": nm, "img": img, "type": e["type"]})
                return out
            stage_list.append({
                "id": key, "label": STAGE_LABEL[key],
                "armor": enrich(groups["armor"]),
                "weapons": enrich(groups["weapons"]),
                "accessories": enrich(groups["accessories"]),
                "buffs": enrich(groups["buffs"]),
                "ammo": enrich(groups["ammo"]),
            })
        classes_out[c] = {"label": data["label"], "stages": stage_list}

    # ---- build bosses.json ----
    # Canonical Calamity/Infernum boss order (matches the vault boss pages).
    BOSS_ORDER = [
        "King Slime","Desert Scourge","Giant Clam","Crabulon","Eye of Cthulhu","The Hive Mind",
        "The Perforators","The Slime God","Eater of Worlds","Brain of Cthulhu","Queen Bee","Skeletron",
        "Wall of Flesh","Cragmaw Mire","The Twins","Cryogen","Aquatic Scourge","Brimstone Elemental",
        "The Destroyer","Skeletron Prime","Great Sand Shark","Calamitas Clone","Leviathan and Anahita",
        "Astrum Aureus","Plantera","The Plaguebringer Goliath","Ravager","Golem","Astrum Deus",
        "Cryogen","Duke Fishron","Mauler","Nuclear Terror","Lunatic Cultist","Betsy","Moon Lord",
        "Profaned Guardians","The Dragonfolly","Providence, the Profaned Goddess","Storm Weaver",
        "Ceaseless Void","Signus, Envoy of the Devourer","Polterghast","The Old Duke","The Devourer of Gods",
        "Yharon, Dragon of Rebirth","Exo Mechs","Supreme Calamitas","Adult Eidolon Wyrm",
    ]
    # The Drops table's Npc display name doesn't always match the boss page name.
    BOSS_ALIASES = {
        "Supreme Calamitas": ["Supreme Witch, Calamitas", "Supreme Calamitas"],
        "Signus, Envoy of the Devourer": ["Signus, Envoy of the Devourer", "Signus"],
        "The Dragonfolly": ["The Dragonfolly", "Dragonfolly", "Bumblefuck"],
        "Adult Eidolon Wyrm": ["Adult Eidolon Wyrm", "Eidolon Wyrm"],
        "Calamitas Clone": ["Calamitas Clone", "Calamitas"],
        "Leviathan and Anahita": ["Leviathan and Anahita", "Leviathan", "Anahita"],
        "Astrum Deus": ["Astrum Deus"],
        "The Devourer of Gods": ["The Devourer of Gods", "Devourer of Gods"],
        "Providence, the Profaned Goddess": ["Providence, the Profaned Goddess", "Providence"],
        "Yharon, Dragon of Rebirth": ["Yharon, Dragon of Rebirth", "Yharon"],
        "The Plaguebringer Goliath": ["The Plaguebringer Goliath", "Plaguebringer Goliath"],
    }
    # index drops by primary npc name
    npc_drops = {}
    for d in drops:
        npc = canon(primary_npc_name(d.get("Npc")))
        if not npc:
            continue
        item = canon(d.get("Item") or "")
        if not item:
            continue
        npc_drops.setdefault(npc, []).append({
            "item": item,
            "img": items[item]["img"] if item in items else sprite_url(item + ".png"),
            "chance": clean_inline(d.get("Chance")),
            "amount": clean_inline(d.get("Amount") or "1") or "1",
        })

    def drops_for(boss):
        names = BOSS_ALIASES.get(boss, [boss])
        out, seen_items = [], set()
        for nm in names:
            for dr in npc_drops.get(nm, []):
                if dr["item"] not in seen_items:
                    seen_items.add(dr["item"]); out.append(dr)
        return out

    bosses_out = []
    seen = set()
    for i, b in enumerate(BOSS_ORDER):
        if b in seen:
            continue
        seen.add(b)
        bosses_out.append({
            "name": b,
            "order": i,
            "img": sprite_url(b.split(",")[0] + ".png"),
            "drops": drops_for(b),
        })

    os.makedirs(OUT, exist_ok=True)
    meta = {
        "generatedAt": datetime.date.today().isoformat(),
        "source": "calamitymod.wiki.gg Cargo API (Recipes/ClassSetups/Drops)",
        "itemCount": len(items),
        "recipeCount": n_recipes,
    }
    with open(os.path.join(OUT, "items.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "items": items}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "classes.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "classes": classes_out}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "bosses.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "bosses": bosses_out}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"items={len(items)} recipes={n_recipes} shimmer={n_shimmer} bosses={len(bosses_out)}")
    craftable = sum(1 for n in items.values() if n['craftable'])
    dropped = sum(1 for n in items.values() if n['dropped'])
    print(f"craftable={craftable} dropped={dropped}")
    # sanity: a few known items
    for probe in ["Life Alloy", "Ascendant Spirit Essence", "Cosmilite Bar", "Zenith", "Draedon's Heart"]:
        if probe in items:
            print(f"OK node: {probe} recipes={len(items[probe]['recipes'])} usedIn={len(items[probe]['usedIn'])}")
        else:
            print(f"MISSING node: {probe}")

if __name__ == "__main__":
    main()
