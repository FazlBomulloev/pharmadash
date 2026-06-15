from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    DateTime,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Market(Base):
    __tablename__ = "markets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    years_json = Column(Text, nullable=False)
    regions_json = Column(Text, nullable=True)
    language = Column(String(2), nullable=False, default="ru")
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    field_mappings = relationship(
        "FieldMapping", back_populates="market",
        cascade="all, delete-orphan",
    )
    bdp_rows = relationship(
        "BdpRaw", back_populates="market",
        cascade="all, delete-orphan",
    )
    avp_rows = relationship(
        "Avp", back_populates="market",
        cascade="all, delete-orphan",
    )
    kap_rows = relationship(
        "Kap", back_populates="market",
        cascade="all, delete-orphan",
    )
    pc_rows = relationship(
        "PcEntry", back_populates="market",
        cascade="all, delete-orphan",
    )
    pc_mappings = relationship(
        "PcMapping", back_populates="market",
        cascade="all, delete-orphan",
    )
    grls_rows = relationship(
        "GrlsEntry", back_populates="market",
        cascade="all, delete-orphan",
    )
    grls_mappings = relationship(
        "GrlsMapping", back_populates="market",
        cascade="all, delete-orphan",
    )


class FieldMapping(Base):
    __tablename__ = "field_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False,
    )
    system_field = Column(String(50), nullable=False)
    file_column = Column(String(200), nullable=False)

    market = relationship("Market", back_populates="field_mappings")


class BdpRaw(Base):
    __tablename__ = "bdp_raw"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    mnn = Column(String(300), nullable=False, index=True)
    tm = Column(String(300), nullable=False)
    producer = Column(String(300), nullable=False)
    sector = Column(String(20), nullable=False)
    region = Column(String(100), nullable=False)
    atc = Column(String(200), nullable=True)
    lf = Column(String(100), nullable=True)
    lf_avp = Column(String(100), nullable=False)
    strength = Column(String(200), nullable=True)
    pack_size = Column(String(100), nullable=True)
    country_mfr = Column(String(100), nullable=True)
    bg_g = Column(String(10), nullable=True)
    usd_y1 = Column(Float, nullable=False, default=0.0)
    usd_y2 = Column(Float, nullable=False, default=0.0)
    usd_y3 = Column(Float, nullable=False, default=0.0)
    un_y1 = Column(Float, nullable=False, default=0.0)
    un_y2 = Column(Float, nullable=False, default=0.0)
    un_y3 = Column(Float, nullable=False, default=0.0)

    mnn_canonical = Column(String(300), nullable=False, index=True, default="")
    lf_canonical = Column(String(200), nullable=True, index=True)
    producer_canonical = Column(String(300), nullable=True, index=True)
    sector_canonical = Column(String(50), nullable=True, index=True)

    market = relationship("Market", back_populates="bdp_rows")


class Avp(Base):
    __tablename__ = "avp"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    mnn = Column(String(300), nullable=False, index=True)
    lf_avp = Column(String(100), nullable=False)

    total_usd_y1 = Column(Float, default=0.0)
    total_usd_y2 = Column(Float, default=0.0)
    total_usd_y3 = Column(Float, default=0.0)
    total_un_y1 = Column(Float, default=0.0)
    total_un_y2 = Column(Float, default=0.0)
    total_un_y3 = Column(Float, default=0.0)

    hos_usd_y3 = Column(Float, default=0.0)
    ret_usd_y3 = Column(Float, default=0.0)

    competitors_total = Column(Integer, default=0)
    competitors_hos = Column(Integer, default=0)
    competitors_ret = Column(Integer, default=0)

    usd_growth = Column(Float, nullable=True)
    un_growth = Column(Float, nullable=True)

    region_usd_json = Column(Text, nullable=True)
    region_un_json = Column(Text, nullable=True)
    region_competitors_json = Column(Text, nullable=True)
    region_shares_json = Column(Text, nullable=True)

    market = relationship("Market", back_populates="avp_rows")


class Kap(Base):
    __tablename__ = "kap"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    mnn = Column(String(300), nullable=False, index=True)
    lf_avp = Column(String(100), nullable=False)
    atc = Column(String(200), nullable=True)

    competitors_count = Column(Integer, default=0)
    main_competitor_ret = Column(String(300), nullable=True)
    main_competitor_total = Column(String(300), nullable=True)

    un_hos_y1 = Column(Float, default=0.0)
    un_hos_y2 = Column(Float, default=0.0)
    un_hos_y3 = Column(Float, default=0.0)
    un_ret_y1 = Column(Float, default=0.0)
    un_ret_y2 = Column(Float, default=0.0)
    un_ret_y3 = Column(Float, default=0.0)

    usd_hos_y1 = Column(Float, default=0.0)
    usd_hos_y2 = Column(Float, default=0.0)
    usd_hos_y3 = Column(Float, default=0.0)
    usd_ret_y1 = Column(Float, default=0.0)
    usd_ret_y2 = Column(Float, default=0.0)
    usd_ret_y3 = Column(Float, default=0.0)

    un_growth = Column(Float, nullable=True)
    usd_growth = Column(Float, nullable=True)

    bg_count = Column(Integer, default=0)
    g_count = Column(Integer, default=0)
    bg_share = Column(Float, nullable=True)

    region_shares_json = Column(Text, nullable=True)
    region_competitors_json = Column(Text, nullable=True)

    market = relationship("Market", back_populates="kap_rows")


class DictionaryEntry(Base):
    __tablename__ = "dictionary_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    field_type = Column(String(20), nullable=False, index=True)
    value_en = Column(String(500), nullable=True, index=True)
    value_ru = Column(String(500), nullable=True, index=True)
    canonical = Column(String(500), nullable=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "field_type", "canonical", name="uq_dict_type_canonical",
        ),
    )

    aliases = relationship(
        "DictionaryAlias",
        back_populates="entry",
        cascade="all, delete-orphan",
    )


class DictionaryAlias(Base):
    __tablename__ = "dictionary_aliases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entry_id = Column(
        Integer,
        ForeignKey("dictionary_entries.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    alias = Column(String(500), nullable=False, index=True)
    language = Column(String(2), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    entry = relationship("DictionaryEntry", back_populates="aliases")


class PcEntry(Base):
    __tablename__ = "pc_entry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    mnn_raw = Column(String(300), nullable=False, index=True)
    mnn_canonical = Column(String(300), nullable=False, index=True, default="")
    tm = Column(String(300), nullable=True)
    lf = Column(String(300), nullable=True)
    lf_canonical = Column(String(200), nullable=True, index=True)
    owner = Column(String(300), nullable=True)
    owner_canonical = Column(String(300), nullable=True, index=True)
    pack_qty = Column(String(200), nullable=True)
    price_rub_no_vat = Column(Float, nullable=False, default=0.0)
    price_reg_date = Column(Date, nullable=True)
    price_effective_date = Column(Date, nullable=True)

    market = relationship("Market", back_populates="pc_rows")


class PcMapping(Base):
    __tablename__ = "pc_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False,
    )
    system_field = Column(String(50), nullable=False)
    file_column = Column(String(200), nullable=False)

    market = relationship("Market", back_populates="pc_mappings")


class GrlsEntry(Base):
    __tablename__ = "grls_entry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    mnn_raw = Column(String(300), nullable=False, index=True)
    mnn_canonical = Column(String(300), nullable=False, index=True, default="")
    tm = Column(String(300), nullable=True)
    ru_holder = Column(String(300), nullable=True)
    ru_holder_canonical = Column(String(300), nullable=True, index=True)
    lf_full = Column(String(500), nullable=True)
    lf_canonical = Column(String(200), nullable=True, index=True)
    dosage = Column(String(200), nullable=True)
    jnvlp = Column(Boolean, nullable=False, default=False)
    ru_number = Column(String(100), nullable=True)
    reg_date = Column(Date, nullable=True)
    expire_date = Column(Date, nullable=True)
    cancel_date = Column(Date, nullable=True)
    status = Column(String(100), nullable=False, index=True, default="")

    market = relationship("Market", back_populates="grls_rows")


class GrlsMapping(Base):
    __tablename__ = "grls_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"),
        nullable=False,
    )
    system_field = Column(String(50), nullable=False)
    file_column = Column(String(200), nullable=False)

    market = relationship("Market", back_populates="grls_mappings")
