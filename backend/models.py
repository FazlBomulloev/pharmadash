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

    # JSON: {"region": {"hos": {y1,y2,y3}, "ret": {y1,y2,y3}}}
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

    # JSON: {"region_name": share_float}
    region_shares_json = Column(Text, nullable=True)
    # JSON: {"region_name": {"y2": count, "y3": count}}
    region_competitors_json = Column(Text, nullable=True)

    market = relationship("Market", back_populates="kap_rows")
