from datetime import datetime
from sqlalchemy import (
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    DateTime,
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
    scoring_settings_json = Column(Text, nullable=True)

    field_mappings = relationship(
        "FieldMapping", back_populates="market",
        cascade="all, delete-orphan",
    )
    bdp_rows = relationship(
        "BdpRaw", back_populates="market",
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

    market = relationship("Market", back_populates="bdp_rows")


class PharmacyPrice(Base):
    __tablename__ = "pharmacy_prices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)
    name = Column(String(500), nullable=False)
    mnn = Column(String(300), nullable=True, index=True)
    trade_name = Column(String(300), nullable=True, index=True)
    manufacturer = Column(String(300), nullable=True, index=True)
    country = Column(String(200), nullable=True, index=True)
    form = Column(String(300), nullable=True, index=True)
    dosage = Column(String(200), nullable=True)
    pack_qty = Column(String(100), nullable=True)
    price = Column(Float, nullable=True, index=True)
    price_discount = Column(Float, nullable=True)
    url = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    extra_json = Column(Text, nullable=True)
    scraped_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, index=True,
    )


class PharmacySourceRun(Base):
    __tablename__ = "pharmacy_source_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String(50), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="running")
    items_count = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)
