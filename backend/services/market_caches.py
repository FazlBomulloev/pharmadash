import logging

from backend.services.response_cache import MarketCache

log = logging.getLogger(__name__)

# Карточки рынков для /markets: зависят от БДП, файла загрузки и
# настроек скоринга (категории).
MARKET_CARDS = MarketCache(max_items=200)
# Списки классов, форм и стран для настроек скоринга: зависят только от БДП.
SETTINGS_LISTS = MarketCache(max_items=200)


def invalidate_market_card(market_id: int) -> None:
    if MARKET_CARDS.invalidate(market_id):
        log.info("Кеш карточки рынка %d сброшен", market_id)


def invalidate_settings_lists(market_id: int) -> None:
    if SETTINGS_LISTS.invalidate(market_id):
        log.info("Кеш списков настроек рынка %d сброшен", market_id)
