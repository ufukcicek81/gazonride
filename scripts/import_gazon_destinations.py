#!/usr/bin/env python3
"""Build the GaZonRide destination catalogue from the user-supplied 1021-place guide.
Extract place/experience facts into a normalized JSON file for static hosting.
"""
import json
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SOURCE = "https://www.turkishnews.com/2021/07/05/1001-turkiye/"
OUTPUT = Path("gazon-destinations.json")
PROVINCES = """Adana|Adıyaman|Afyonkarahisar|Ağrı|Aksaray|Amasya|Ankara|Antalya|Ardahan|Artvin|Aydın|Balıkesir|Bartın|Batman|Bayburt|Bilecik|Bingöl|Bitlis|Bolu|Burdur|Bursa|Çanakkale|Çankırı|Çorum|Denizli|Diyarbakır|Düzce|Edirne|Elazığ|Erzincan|Erzurum|Eskişehir|Gaziantep|Giresun|Gümüşhane|Hakkari|Hatay|Iğdır|Isparta|İstanbul|İzmir|Kahramanmaraş|Karabük|Karaman|Kars|Kastamonu|Kayseri|Kırıkkale|Kırklareli|Kırşehir|Kilis|Kocaeli|Konya|Kütahya|Malatya|Manisa|Mardin|Mersin|Muğla|Muş|Nevşehir|Niğde|Ordu|Osmaniye|Rize|Sakarya|Samsun|Siirt|Sinop|Sivas|Şanlıurfa|Şırnak|Tekirdağ|Tokat|Trabzon|Tunceli|Uşak|Van|Yalova|Yozgat|Zonguldak""".split("|")
PROVINCE_SET = set(PROVINCES)
ALIASES = {"Şanliurfa": "Şanlıurfa", "Afyon": "Afyonkarahisar", "Uludağ": "Bursa"}
NUMBER_LINE = re.compile(r"^\s*(\d{1,4})\s+(.{4,})$")


def get_city(phrase):
    first = re.split(r"[\s\-–]", phrase.strip(), 1)[0]
    if first.startswith("Uludağ"):
        return "Bursa"
    return first if first in PROVINCE_SET else ALIASES.get(first)


def category(text):
    t = text.casefold()
    if any(w in t for w in ("şelale", "yayla", "vadi", "göl", "dağ", "kanyon", "orman", "mağara", "nehir", "tabiat", "rafting")):
        return "Doğa"
    if any(w in t for w in ("antik", "müze", "kale", "tapınak", "türbe", "kilise", "manastır", "höyük", "köprü", "ören", "mezar", "saray")):
        return "Tarih"
    if any(w in t for w in ("plaj", "koy", "deniz", "sahil", "dalış", "ada", "yüz")):
        return "Deniz"
    if any(w in t for w in ("festival", "şenlik", "kutla", "maraton", "konser")):
        return "Etkinlik"
    if any(w in t for w in ("ye", "iç", "kahve", "kahvaltı", "tat", "gurme")):
        return "Lezzet"
    return "Keşif"


def parse_article(html):
    soup = BeautifulSoup(html, "html.parser")
    host = soup.select_one("article") or soup.select_one("main") or soup.body or soup
    lines = [re.sub(r"\s+", " ", s).strip() for s in host.get_text("\n", strip=True).splitlines()]
    records = []
    pending = None
    started = False
    for line in lines:
        m = NUMBER_LINE.match(line)
        number = int(m.group(1)) if m else None
        body = m.group(2).strip() if m else ""
        city = get_city(body) if m else None
        if m and 1 <= number <= 1021 and city:
            started = True
            if pending:
                records.append(pending)
            pending = {"number": number, "city": city, "text": body}
            continue
        if pending and started:
            # Line 740 is broken by an HTML line break in the source.
            if re.match(r"^\s*\d{1,4}\s+", line):
                continue
            if line.startswith(("antіk ", "antik kentini", "antik kenti")):
                pending["text"] += " " + line
            if len(records) >= 1001 and line.startswith("Yazıda kullanılan"):
                break
    if pending:
        records.append(pending)

    # Page source has repeated numbers in the appendix. Preserve all events,
    # but create stable unique sequential IDs rather than the broken source numbers.
    result = []
    for n, row in enumerate(records, 1):
        city, text = row["city"], row["text"]
        label = re.sub(r"^" + re.escape(city) + r"(?:\s*[-–])?\s*", "", text, count=1)
        label = label.strip(" -–.") or text
        result.append({
            "id": n,
            "sourceNumber": row["number"],
            "city": city,
            "title": label,
            "category": category(label),
            "search": f"{label} {city} Türkiye",
        })
    return result


def main():
    headers = {"User-Agent": "GaZonRide/1.0 public destination catalogue importer"}
    response = requests.get(SOURCE, timeout=45, headers=headers)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or "utf-8"
    data = parse_article(response.text)
    cities = set(x["city"] for x in data)
    missing = sorted(PROVINCE_SET - cities)
    if len(data) < 1000 or len(data) > 1080 or missing:
        raise ValueError(f"Incomplete catalogue: {len(data)} entries, {len(cities)} provinces, missing={missing}")
    assert data[0]["city"] == "Adana"
    assert any(x["city"] == "Düzce" and "Güzeldere" in x["title"] for x in data)
    OUTPUT.write_text(json.dumps({"source": SOURCE, "version": 1, "cities": PROVINCES, "items": data}, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"OK: wrote {OUTPUT} with {len(data)} entries across {len(cities)} cities.")


if __name__ == "__main__":
    main()
