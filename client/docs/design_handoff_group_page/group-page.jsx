// Group page — WhatsApp-style redesign
// Same color palette as the original app screens.

const COLORS = {
  bg: '#F4ECDC',           // warm cream background
  cardWhite: '#FFFFFF',
  coral: '#E76F51',        // primary accent
  coralDeep: '#D85A3C',
  coralPale: '#FCE5DC',    // revoke btn bg / "your" bubble
  ink: '#142133',          // primary dark text
  inkSoft: '#3A4759',
  muted: '#B0A085',        // tan small caps / secondary
  divider: 'rgba(20,33,51,0.08)',
  tag: '#D6A77A',          // little coupon-tag glyph color
};

// Distinct sender accent colors (WhatsApp-style colored names)
const SENDER_ACCENTS = ['#1F7A8C', '#7A4FB7', '#2E8B57', '#C77B30', '#B83A5E'];

// ─────────────────────────────────────────────────────────────
// Tiny icons
// ─────────────────────────────────────────────────────────────
const IconBack = ({ c = COLORS.ink }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M15 6l-6 6 6 6" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconGear = ({ c = COLORS.ink }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke={c} strokeWidth="1.7"/>
    <path d="M19.4 12.9a7.6 7.6 0 000-1.8l1.9-1.4-1.9-3.3-2.2.9a7.5 7.5 0 00-1.6-.9L15.2 4h-3.8l-.4 2.3a7.5 7.5 0 00-1.6.9l-2.2-.9-1.9 3.3 1.9 1.4a7.6 7.6 0 000 1.8l-1.9 1.4 1.9 3.3 2.2-.9c.5.4 1 .7 1.6.9l.4 2.3h3.8l.4-2.3c.6-.2 1.1-.5 1.6-.9l2.2.9 1.9-3.3-1.9-1.4z" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
  </svg>
);
const IconFilter = ({ c = COLORS.coral }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 5h14M5.5 10h9M8.5 15h3" stroke={c} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconTag = ({ c = COLORS.tag, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M3.5 12.7L11.3 4.9a1.6 1.6 0 011.2-.5l5.6.1a1.6 1.6 0 011.6 1.6l.1 5.6a1.6 1.6 0 01-.5 1.2l-7.8 7.8a1.6 1.6 0 01-2.3 0l-5.7-5.7a1.6 1.6 0 010-2.3z"
      stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
    <circle cx="15.6" cy="8.4" r="1.2" fill={c}/>
  </svg>
);
const IconChevron = ({ c = COLORS.muted }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconPlus = ({ c = '#fff' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2.6" strokeLinecap="round"/>
  </svg>
);
const IconShare = ({ c = '#fff' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3.5 12.7L11.3 4.9a1.6 1.6 0 011.2-.5l5.6.1a1.6 1.6 0 011.6 1.6l.1 5.6a1.6 1.6 0 01-.5 1.2l-7.8 7.8a1.6 1.6 0 01-2.3 0l-5.7-5.7a1.6 1.6 0 010-2.3z"
      stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
    <circle cx="15.6" cy="8.4" r="1.3" fill={c}/>
  </svg>
);
const IconCheck = ({ c = COLORS.muted }) => (
  <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
    <path d="M1 5l3.2 3.2L9 1.8M6 5l3.2 3.2L13 1.8" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
const MEMBERS = [
  { id: 'av', name: 'Aviv',  short: 'You', initials: 'AV', isYou: true,  isAdmin: true },
  { id: 'te', name: 'Test1', short: 'Test1', initials: 'TE' },
  { id: 'no', name: 'Noa',   short: 'Noa',   initials: 'NO' },
  { id: 'da', name: 'Dan',   short: 'Dan',   initials: 'DA' },
];

const COUPONS_SEED = [
  { id: 1, sender: 'te', brand: 'American Eagle', category: 'Fashion', expires: '18/08/2030', time: '14:22' },
  { id: 2, sender: 'no', brand: 'Starbucks',      category: 'Coffee',  expires: '02/11/2026', time: '09:41' },
  { id: 3, sender: 'av', brand: 'Sephora',        category: 'Beauty',  expires: '30/12/2026', time: 'Yesterday' },
  { id: 4, sender: 'da', brand: 'Uber Eats',      category: 'Food',    expires: '15/06/2026', time: 'Mon' },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const senderById = id => MEMBERS.find(m => m.id === id) || MEMBERS[0];
const accentFor = id => {
  const i = MEMBERS.findIndex(m => m.id === id);
  return SENDER_ACCENTS[Math.max(0, i) % SENDER_ACCENTS.length];
};

function Avatar({ initials, size = 36, color = COLORS.coral, ring = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.36, letterSpacing: 0.3,
      flexShrink: 0,
      boxShadow: ring ? '0 0 0 2px #fff, 0 0 0 3.5px rgba(231,111,81,0.25)' : 'none',
    }}>{initials}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────
function Header({ groupName = 'My New group' }) {
  return (
    <div style={{
      paddingTop: 56, paddingBottom: 14, paddingLeft: 14, paddingRight: 18,
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: `1px solid ${COLORS.divider}`,
      background: COLORS.bg,
    }}>
      <button style={btnReset()}><IconBack/></button>
      <div style={{ position: 'relative' }}>
        <Avatar initials="MY" size={44}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 19, color: COLORS.ink, lineHeight: 1.15 }}>{groupName}</div>
        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>Tap photo to edit</div>
      </div>
      <button style={btnReset()}><IconGear/></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Slim members row — horizontal list of avatar + name pills
// ─────────────────────────────────────────────────────────────
function MembersRow({ members, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px 10px',
      ...style,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.muted, letterSpacing: 0.8, textTransform: 'uppercase' }}>
        Members · {members.length}
      </div>
      <button style={{ ...btnReset(), display: 'flex', alignItems: 'center', gap: 4, color: COLORS.coral, fontSize: 13, fontWeight: 600 }}>
        View all <IconChevron c={COLORS.coral}/>
      </button>
    </div>
  );
}

function MembersStrip({ members }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '0 16px 14px',
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {/* Add member chip */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, width: 56 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: COLORS.coralPale, border: `1.5px dashed ${COLORS.coral}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconPlus c={COLORS.coral}/>
        </div>
        <div style={{ fontSize: 11, color: COLORS.coral, fontWeight: 600 }}>Add</div>
      </div>
      {members.map(m => (
        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, width: 56 }}>
          <Avatar initials={m.initials} size={40} color={m.isYou ? COLORS.coral : '#E07A5F'} ring={m.isYou}/>
          <div style={{
            fontSize: 11, fontWeight: 600, color: COLORS.ink, maxWidth: 56,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {m.isYou ? 'You' : m.name}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Share Coupon big button
// ─────────────────────────────────────────────────────────────
function ShareCouponButton() {
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <button style={{
        ...btnReset(),
        width: '100%', height: 60, borderRadius: 18,
        background: COLORS.coral,
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        boxShadow: '0 8px 20px rgba(231,111,81,0.28), 0 2px 4px rgba(231,111,81,0.18)',
      }}>
        <IconShare/>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.2 }}>Share a Coupon</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared Coupons header with filter
// ─────────────────────────────────────────────────────────────
function SharedCouponsHeader({ count, onFilter, hasFilter }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 18px 12px',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.muted, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        Shared Coupons ({count})
      </div>
      <button onClick={onFilter} style={{
        ...btnReset(),
        width: 36, height: 36, borderRadius: 12,
        background: hasFilter ? COLORS.coral : COLORS.cardWhite,
        border: `1px solid ${hasFilter ? COLORS.coral : COLORS.divider}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <IconFilter c={hasFilter ? '#fff' : COLORS.coral}/>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Coupon card (list / grid item) with sender attribution
// ─────────────────────────────────────────────────────────────
function CouponCard({ coupon, grid }) {
  const sender = senderById(coupon.sender);
  const accent = accentFor(coupon.sender);
  const isYou = sender.isYou;

  return (
    <div style={{
      background: COLORS.cardWhite,
      borderRadius: 16,
      border: `1px solid ${COLORS.divider}`,
      boxShadow: '0 2px 6px rgba(20,33,51,0.05)',
      padding: grid ? 12 : 14,
      display: 'flex', flexDirection: 'column', gap: grid ? 10 : 12,
    }}>
      {/* Sender attribution row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar
          initials={sender.initials}
          size={24}
          color={isYou ? COLORS.coral : '#E07A5F'}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: isYou ? COLORS.coralDeep : accent }}>
          {isYou ? 'You' : sender.name}
        </span>
        <span style={{ fontSize: 12, color: COLORS.muted, marginLeft: 'auto' }}>{coupon.time}</span>
      </div>

      {/* Coupon body */}
      <div style={{ display: 'flex', alignItems: grid ? 'flex-start' : 'center', gap: 12 }}>
        <div style={{
          width: grid ? 40 : 46, height: grid ? 40 : 46, borderRadius: 12,
          background: 'rgba(214,167,122,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <IconTag size={grid ? 22 : 26}/>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: grid ? 15 : 17, fontWeight: 700, color: COLORS.ink, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: grid ? 'nowrap' : 'normal' }}>
            {coupon.brand}
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>{coupon.category}</div>
          {!grid && (
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
              Expires {coupon.expires}
            </div>
          )}
        </div>
      </div>

      {grid && (
        <div style={{ fontSize: 11.5, color: COLORS.muted }}>Exp {coupon.expires}</div>
      )}

      {/* Action */}
      <button style={{
        ...btnReset(),
        width: '100%',
        background: isYou ? 'rgba(216,90,60,0.10)' : COLORS.coralPale,
        color: COLORS.coralDeep,
        fontSize: 14, fontWeight: 700,
        padding: '9px 0', borderRadius: 10,
        textAlign: 'center',
      }}>
        {isYou ? 'Revoke' : 'Use coupon'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────
function GroupScreen({ tweaks }) {
  const { showAllCoupons, layout } = tweaks;
  const coupons = showAllCoupons ? COUPONS_SEED : COUPONS_SEED.slice(0, 1);
  const isGrid = layout === 'grid';

  return (
    <div style={{
      minHeight: '100%', background: COLORS.bg,
      fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
      paddingBottom: 60,
    }}>
      <Header/>
      <MembersRow members={MEMBERS}/>
      <MembersStrip members={MEMBERS}/>
      <ShareCouponButton/>
      <SharedCouponsHeader count={coupons.length} hasFilter={false}/>

      <div style={{
        padding: '0 16px',
        display: isGrid ? 'grid' : 'flex',
        gridTemplateColumns: isGrid ? '1fr 1fr' : undefined,
        flexDirection: isGrid ? undefined : 'column',
        gap: 12,
      }}>
        {coupons.map(c => (
          <CouponCard key={c.id} coupon={c} grid={isGrid}/>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────
function btnReset() {
  return {
    background: 'none', border: 'none', padding: 0, margin: 0,
    cursor: 'pointer', font: 'inherit', color: 'inherit',
    appearance: 'none', WebkitAppearance: 'none',
  };
}

Object.assign(window, { GroupScreen });
