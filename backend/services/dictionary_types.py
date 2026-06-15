DICT_TYPE_MNN = "mnn"
DICT_TYPE_LF = "lf"
DICT_TYPE_PRODUCER = "producer"
DICT_TYPE_SECTOR = "sector"

DICT_TYPES = [
    DICT_TYPE_MNN,
    DICT_TYPE_LF,
    DICT_TYPE_PRODUCER,
    DICT_TYPE_SECTOR,
]

DICT_TYPE_LABELS = {
    DICT_TYPE_MNN: "МНН",
    DICT_TYPE_LF: "Лекарственные формы",
    DICT_TYPE_PRODUCER: "Производители",
    DICT_TYPE_SECTOR: "Сектор",
}

SOURCE_FIELD_TO_DICT_TYPE = {
    "mnn": DICT_TYPE_MNN,
    "lf_avp": DICT_TYPE_LF,
    "producer": DICT_TYPE_PRODUCER,
    "sector": DICT_TYPE_SECTOR,
    "mnn_raw": DICT_TYPE_MNN,
    "lf": DICT_TYPE_LF,
    "owner": DICT_TYPE_PRODUCER,
    "lf_full": DICT_TYPE_LF,
    "ru_holder": DICT_TYPE_PRODUCER,
}

CANONICAL_FIELD_MAP = {
    "mnn": "mnn_canonical",
    "lf_avp": "lf_canonical",
    "producer": "producer_canonical",
    "sector": "sector_canonical",
    "mnn_raw": "mnn_canonical",
    "lf": "lf_canonical",
    "owner": "owner_canonical",
    "lf_full": "lf_canonical",
    "ru_holder": "ru_holder_canonical",
}
