from collections import OrderedDict
from typing import Any


class MarketCache:
    def __init__(self, max_items: int):
        self._items: OrderedDict[tuple, Any] = OrderedDict()
        self._max_items = max_items
        self._epoch = 0
        self._generations: dict[int, int] = {}

    def get(self, key: tuple) -> Any | None:
        value = self._items.get(key)
        if value is not None:
            self._items.move_to_end(key)
        return value

    def generation(self, market_id: int) -> tuple[int, int]:
        return self._epoch, self._generations.get(market_id, 0)

    def set(self, key: tuple, value: Any, generation: tuple[int, int]) -> bool:
        # Пока считался ответ, данные рынка могли смениться: такой ответ
        # устарел ещё до записи, и без срока жизни он остался бы навсегда.
        if generation != self.generation(key[0]):
            return False
        self._items[key] = value
        self._items.move_to_end(key)
        while len(self._items) > self._max_items:
            self._items.popitem(last=False)
        return True

    def invalidate(self, market_id: int | None = None) -> int:
        if market_id is None:
            self._epoch += 1
            count = len(self._items)
            self._items.clear()
            return count
        self._generations[market_id] = self._generations.get(market_id, 0) + 1
        keys = [k for k in self._items if k[0] == market_id]
        for k in keys:
            del self._items[k]
        return len(keys)
