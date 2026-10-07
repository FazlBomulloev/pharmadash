import pytest

from backend.services.pharmacies.eapteka import parse_listing
from backend.services.pharmacies.name_parse import (
    parse_dosage,
    parse_form,
    parse_pack_qty,
    parse_trade_name,
)
from backend.services.pharmacies.ozerki import OzerkiAdapter


# ────────────────────── разбор названия ──────────────────────

@pytest.mark.parametrize("name, form, dosage, pack, trade", [
    (
        "Нурофен таблетки покрыт.плен.об. 200 мг 20 шт",
        "таблетки покрыт.плен.об.", "200 мг", "20", "Нурофен",
    ),
    (
        "Норлакс Фито порошок для приготовления раствора 5 г 20 шт",
        "порошок для приготовления раствора", "5 г", "20", "Норлакс Фито",
    ),
    (
        "Семавик Некст раствор для подкожного введ 1 мг/доза 3 мл 1 шт",
        "раствор для подкожного введ", "1 мг/доза", "1", "Семавик Некст",
    ),
    (
        "Називин спрей назальный 0,05 % 10 мл",
        "спрей назальный", "0,05 %", "", "Називин",
    ),
    # нет ни формы, ни дозировки, ни фасовки
    ("Гематоген детский", "", "", "", "Гематоген детский"),
    # «г» внутри слова — не дозировка
    ("Витамин С 30 горошин", "", "", "", "Витамин С"),
])
def test_name_parts(name, form, dosage, pack, trade):
    assert parse_form(name) == form
    assert parse_dosage(name) == dosage
    assert parse_pack_qty(name) == pack
    assert parse_trade_name(name) == trade


def test_name_parsers_survive_empty_input():
    for parser in (parse_form, parse_dosage, parse_pack_qty, parse_trade_name):
        assert parser("") == ""
        assert parser(None) == ""


# ────────────────────── eApteka: список категории ──────────────────────

ORIGINAL_MARK = '<p class="listing-card__original">Оригинальный препарат</p>'


def card(xml_id="513888", price="694", old_price='data-old-price="868"',
         original=False):
    offer = (
        '{"itemId":%s,"itemPrice":%s,'
        '"itemName":"Висмута-Вертекс таблетки 120 мг 112 шт",'
        '"itemBrand":"Вертекс","itemCategory":"При язве"}'
    ) % (xml_id, price)
    return (
        '<article class="listing-card js-neon-item" data-role="offer-item"'
        f' data-id="1" data-xml-id="{xml_id}"'
        f" data-oldma-offer='{offer}'>"
        f'<a class="listing-card__link" href="/spb/goods/id{xml_id}/">'
        '<img src="https://cdn.eapteka.ru/p.png?t=1&amp;_cvc=2" alt=""/></a>'
        + (ORIGINAL_MARK if original else "") +
        '<div class="listing-card__info">'
        '<p><span class="listing-card__manufacturer">Производитель:</span>'
        ' <a href="/m/">Вертекс, Россия</a></p>'
        '<p><span class="listing-card__ingredient">Действующее вещество:'
        '</span> <a href="/i/">Висмута трикалия&nbsp;дицитрат</a></p></div>'
        f'<span class="listing-card__price-new" data-price="{price}">'
        f'{price} ₽</span>'
        f'<span class="listing-card__price-old" {old_price}>868 ₽</span>'
        '</article>'
    )


def test_listing_card_with_discount():
    [p] = parse_listing("<html>" + card() + "</html>")
    assert p.sku == "513888"
    assert p.name == "Висмута-Вертекс таблетки 120 мг 112 шт"
    assert (p.price, p.price_discount) == (868.0, 694.0)
    assert (p.manufacturer, p.country) == ("Вертекс", "Россия")
    assert p.mnn == "Висмута трикалия дицитрат"
    assert p.trade_name == "Висмута-Вертекс"
    assert (p.form, p.dosage, p.pack_qty) == ("таблетки", "120 мг", "112")
    assert p.url == "https://www.eapteka.ru/spb/goods/id513888/"
    assert p.image_url == "https://cdn.eapteka.ru/p.png?t=1&_cvc=2"
    assert p.extra["Оригинал/Дженерик"] == "Дженерик"


def test_listing_card_without_discount_and_original_flag():
    [p] = parse_listing(card(old_price="", original=True))
    assert (p.price, p.price_discount) == (694.0, None)
    assert p.extra["Оригинал/Дженерик"] == "Оригинал"


def test_listing_skips_broken_cards_and_keeps_the_rest():
    broken = '<article class="listing-card"><p>реклама без товара</p></article>'
    products = parse_listing(card(xml_id="1") + broken + card(xml_id="2"))
    assert [p.sku for p in products] == ["1", "2"]
    assert parse_listing("<html>антибот-заглушка</html>") == []
    assert parse_listing("") == []


# ────────────────────── Озерки: элемент списка ──────────────────────

def ozerki_item(**overrides):
    item = {
        "productId": 364695,
        "name": "Норлакс порошок 5 г 20 шт",
        "href": "/catalog/product/norlaks/",
        "mnn": {"name": "Подорожник", "dosage": None},
        "brand": {"name": "Норлакс"},
        "manufacturer": {"name": "Фарминтегро"},
        "country": {"name": "Россия"},
        "src": "https://ozerki.ru/er-pics/images/goods/364695/main",
        "price": {"base": 648, "special": None},
        "categoriesList": [{"name": "Лекарства и БАД"}, {"name": "ЖКТ"}],
        "regStatus": "БАД",
    }
    item.update(overrides)
    return item


def test_ozerki_listing_item():
    p = OzerkiAdapter()._extract_product(ozerki_item())
    assert p.sku == "364695"
    assert (p.price, p.price_discount) == (648.0, None)
    assert (p.mnn, p.trade_name) == ("Подорожник", "Норлакс")
    assert (p.manufacturer, p.country) == ("Фарминтегро", "Россия")
    assert (p.form, p.dosage, p.pack_qty) == ("порошок", "5 г", "20")
    assert p.url.endswith("/catalog/product/norlaks/")


def test_ozerki_item_with_missing_blocks_and_special_price():
    p = OzerkiAdapter()._extract_product(ozerki_item(
        mnn=None, brand=None, manufacturer=None, country=None, src=None,
        price={"base": "900", "special": "750.5"},
    ))
    assert (p.price, p.price_discount) == (900.0, 750.5)
    assert p.trade_name == "Норлакс"  # из названия, раз бренда нет
    assert (p.mnn, p.manufacturer, p.country, p.image_url) == ("", "", "", "")


def test_ozerki_skips_foreign_category_and_items_without_id():
    adapter = OzerkiAdapter()
    assert adapter._extract_product(
        ozerki_item(categoriesList=[{"name": "Косметика"}])
    ) is None
    assert adapter._extract_product(ozerki_item(productId=None)) is None
