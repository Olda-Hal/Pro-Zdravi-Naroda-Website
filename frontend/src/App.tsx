import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const APP_URL = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'
const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN ?? 'localhost'
const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Pro zdraví národa'
const ACCOUNT_NUMBER = import.meta.env.VITE_ACCOUNT_NUMBER ?? '2403575844/2010'
const EVENT_LOCATION = import.meta.env.VITE_EVENT_LOCATION ?? 'CROWD CAFE, PRAHA'
const EVENT_EMAIL = import.meta.env.VITE_EVENT_EMAIL ?? 'info@prozdravinaroda.cz'
const EVENT_DATE = import.meta.env.VITE_EVENT_DATE ?? '21.10.2026'
const EVENT_TIME = import.meta.env.VITE_EVENT_TIME ?? '19:00'

/* ============================== data ============================== */

const TOTAL_TICKETS = 120
const STANDING_TICKETS = 40
const SOLD_TICKETS = 74
const TICKET_PRICE = 1490

type Artist = {
  name: string
  role: string
  detail: string
  initials: string
  hue: number
  link: string
  image: string
  imagePosition?: string
}

const artists: Artist[] = [
  {
    name: 'Jaroslav Svěcený',
    role: 'Hudební produkce',
    detail: 'Na jednom pódiu se spojí slova a hudba pro Alfreda od přátel.',
    initials: 'JS',
    hue: 34,
    link: 'https://www.sveceny.cz/',
    image: encodeURI('/images/Jarda Svěcený.jpg'),
    imagePosition: 'center 24%',
  },
  {
    name: 'Cimbál classic',
    role: 'Tradice a energie',
    detail: 'Tónová kultura, která přináší půvab a sílu do celého večera.',
    initials: 'CC',
    hue: 16,
    link: 'https://cimbalclassic.net/',
    image: encodeURI('/images/Cimbalclassic 1.jpg'),
    imagePosition: 'center 28%',
  },
  {
    name: 'Alfred Strejček',
    role: 'Patron a host',
    detail: 'Karel IV první vstup, osobní i společenský příklad pro národ.',
    initials: 'AS',
    hue: 196,
    link: 'https://www.alfredstrejcek.cz/',
    image: encodeURI('/images/Alfred Strejček 7.jfif'),
    imagePosition: 'center 18%',
  },
  {
    name: 'Martina Kociánová',
    role: 'Moderátorka',
    detail: 'Celý večer moderuje a propojuje hudbu, slova, a myšlenky.',
    initials: 'MK',
    hue: 278,
    link: 'https://www.alfredstrejcek.cz/',
    image: encodeURI('/images/Kociánová Martina 2.jfif'),
    imagePosition: 'center 20%',
  },
]

const timeline = [
  { time: '17:00', title: 'Otevření CROWD CAFE', detail: 'Přivítání hostů a zahájení večera.' },
  { time: '18:00', title: 'Zahájení večera', detail: 'Úvodní slovo pořadatelů.' },
  { time: '18:15', title: 'Zahájení hudební produkce', detail: 'Jaroslav Svěcený uvádí hudební část programu.' },
  { time: '18:25', title: 'Slovní vstup – proslov', detail: 'Karel IV v zastoupení Alfredem Strejčkem na podporu zdraví národa.' },
  { time: '18:30', title: 'Vystoupení sudiček', detail: 'Pohádkově laděný mezní moment celého večera.' },
  { time: '18:45', title: 'Pokračuje hudební produkce', detail: 'Cimbál classic a Jaroslav Svěcený předávají hudbu dál.' },
  { time: '19:45', title: 'Závěr večera a poděkování', detail: 'Oslava, závěrečné poděkování a společné vyjádření podpory.' },
]

const partners = [
  { name: 'CROWD CAFE', url: 'https://www.crowdcafe.cz/' },
  { name: 'Dlouhé zdraví', url: 'https://www.dlouhezdravi.com/' },
  { name: 'Magnolie cukrárna', url: 'https://www.cukrarnamagnolie.cz/' },
  { name: 'Centrum Preventivní Medicíny Brno', url: 'https://cepem.cz' },
  { name: 'KLM invest, a.s.', url: '#' },
]

const spiritualPatron = {
  order: 'Český Templářský Řád O.S.M.T.H',
  komenda: 'Komenda Čejkovice',
  url: 'https://osmth.cz/',
}

const projectPatrons = [
  { year: 'Rok 2027', name: 'Tomáš Garrigue Masaryk', url: 'https://cs.wikipedia.org/wiki/Tom%C3%A1%C5%A1_Garrigue_Masaryk' },
  { year: 'Rok 2028', name: 'Jan Ámos Komenský', url: 'https://cs.wikipedia.org/wiki/Jan_Amos_Komensk%C3%BD' },
  { year: 'Rok 2029', name: 'Josef Dobrovský', url: 'https://cs.wikipedia.org/wiki/Josef_Dobrovsk%C3%BD' },
  { year: 'Rok 2030', name: 'Karel Jaromír Erben', url: 'https://cs.wikipedia.org/wiki/Karel_Jarom%C3%ADr_Erben' },
]

const helpWays = [
  {
    index: '01',
    title: 'Koupit vstupenku',
    text: 'Benefiční vstupenka je nejpřímější forma zapojení do pomoci.',
  },
  {
    index: '02',
    title: 'Přispět na účet',
    text: 'Okamžitý finanční dar lze poslat kdykoli bez návštěvy koncertu.',
  },
  {
    index: '03',
    title: 'Sdílet událost',
    text: 'Pomozte rozšířit dosah akce mezi lidi, kterým téma není lhostejné.',
  },
]

/* ============================ utilities ============================ */

const formatMoney = (value: number) =>
  new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(value)

const pad = (n: number) => String(n).padStart(2, '0')

/* ======================= interaction hooks ======================== */

/** IntersectionObserver-driven reveal */
function useReveal<T extends HTMLElement>(threshold = 0.16) {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, visible }
}

/** Magnetic pull toward cursor */
function useMagnetic<T extends HTMLElement>(strength = 0.35) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || window.matchMedia('(pointer: coarse)').matches) return

    const onMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      node.style.transform = `translate(${x * strength}px, ${y * strength}px)`
    }
    const onLeave = () => {
      node.style.transform = 'translate(0, 0)'
    }

    node.addEventListener('mousemove', onMove)
    node.addEventListener('mouseleave', onLeave)
    return () => {
      node.removeEventListener('mousemove', onMove)
      node.removeEventListener('mouseleave', onLeave)
    }
  }, [strength])

  return ref
}

/** 3D tilt on hover */
function useTilt<T extends HTMLElement>(maxDeg = 7) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || window.matchMedia('(pointer: coarse)').matches) return

    const onMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      node.style.transform = `perspective(900px) rotateY(${(px - 0.5) * maxDeg * 2}deg) rotateX(${(0.5 - py) * maxDeg * 2}deg) translateZ(0)`
      node.style.setProperty('--glare-x', `${px * 100}%`)
      node.style.setProperty('--glare-y', `${py * 100}%`)
    }
    const onLeave = () => {
      node.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg)'
    }

    node.addEventListener('mousemove', onMove)
    node.addEventListener('mouseleave', onLeave)
    return () => {
      node.removeEventListener('mousemove', onMove)
      node.removeEventListener('mouseleave', onLeave)
    }
  }, [maxDeg])

  return ref
}

/* ========================== components ============================ */

/** Kinetic heading — per-character rise-in + hover wave */
function KineticHeading({
  as: Tag = 'h2',
  text,
  className = '',
  id,
}: {
  as?: 'h1' | 'h2' | 'h3'
  text: string
  className?: string
  id?: string
}) {
  const { ref, visible } = useReveal<HTMLHeadingElement>(0.4)
  const words = text.split(' ')
  let charIndex = 0

  return (
    <Tag
      ref={ref}
      id={id}
      className={`kinetic ${visible ? 'is-in' : ''} ${className}`}
      aria-label={text}
    >
      {words.map((word, wi) => (
        <span className="kinetic-word" key={`${word}-${wi}`} aria-hidden="true">
          {Array.from(word).map((char, ci) => {
            const delay = charIndex++ * 28
            return (
              <span
                className="kinetic-char"
                key={`${char}-${ci}`}
                style={{ transitionDelay: `${delay}ms`, animationDelay: `${ci * 40}ms` }}
              >
                {char}
              </span>
            )
          })}
          {wi < words.length - 1 && '\u00A0'}
        </span>
      ))}
    </Tag>
  )
}

/** Section wrapper with reveal */
function Reveal({
  children,
  className = '',
  id,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  id?: string
  delay?: number
}) {
  const { ref, visible } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      id={id}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/** Animated counter that ticks up when scrolled into view */
function CountUp({ target, duration = 1400 }: { target: number; duration?: number }) {
  const { ref, visible } = useReveal<HTMLSpanElement>(0.6)
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!visible) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 4)
      setValue(Math.round(eased * target))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [visible, target, duration])

  return <span ref={ref}>{value}</span>
}

function MagneticButton({
  children,
  href,
  variant = 'primary',
  onClick,
  type,
  target,
  rel,
}: {
  children: ReactNode
  href?: string
  variant?: 'primary' | 'ghost'
  onClick?: () => void
  type?: 'button' | 'submit'
  target?: string
  rel?: string
}) {
  const ref = useMagnetic<HTMLSpanElement>(0.3)
  const inner = (
    <span ref={ref} className="btn-inner">
      <span className="btn-label" data-text={typeof children === 'string' ? children : undefined}>
        {children}
      </span>
      <span className="btn-arrow" aria-hidden="true">
        →
      </span>
    </span>
  )

  if (href) {
    return (
      <a className={`btn btn-${variant}`} href={href} data-cursor="hover" target={target} rel={rel}>
        {inner}
      </a>
    )
  }
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} type={type ?? 'button'} data-cursor="hover">
      {inner}
    </button>
  )
}

/* ============================== app =============================== */

function App() {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [apiStats, setApiStats] = useState({
    total_tickets: TOTAL_TICKETS,
    sold_tickets: SOLD_TICKETS,
    remaining_tickets: TOTAL_TICKETS - SOLD_TICKETS,
    price_per_ticket: TICKET_PRICE,
    currency: 'CZK',
  })
  const [orderForm, setOrderForm] = useState({
    customer_name: '',
    customer_email: '',
    ticket_count: 2,
  })
  const [checkoutState, setCheckoutState] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdOrder, setCreatedOrder] = useState<{
    order_number: string
    amount: number
    expires_at: string
    variable_symbol: string
    account_number: string
    message: string
  } | null>(null)

  const cursorDot = useRef<HTMLDivElement | null>(null)
  const cursorRing = useRef<HTMLDivElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const portraitRef = useTilt<HTMLDivElement>(5)
  const heroPortraitRef = useTilt<HTMLDivElement>(4)

  const soldPercentage = useMemo(
    () => Math.min(Math.round((apiStats.sold_tickets / apiStats.total_tickets) * 100), 100),
    [apiStats.sold_tickets, apiStats.total_tickets],
  )
  const liveStandingTickets = useMemo(
    () => Math.min(STANDING_TICKETS, apiStats.total_tickets),
    [apiStats.total_tickets],
  )

  const loadTicketStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tickets/stats`)
      if (!response.ok) return
      const data = await response.json()
      setApiStats((current) => ({ ...current, ...data }))
    } catch {
      // keep current default values if the API is temporarily unavailable
    }
  }, [])

  useEffect(() => {
    void loadTicketStats()
    const interval = window.setInterval(() => {
      void loadTicketStats()
    }, 8000)
    return () => window.clearInterval(interval)
  }, [loadTicketStats])

  /* scroll progress bar + hero parallax */
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        setScrollProgress(max > 0 ? window.scrollY / max : 0)
        if (heroRef.current) {
          heroRef.current.style.setProperty('--scroll', String(Math.min(window.scrollY / 700, 1)))
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  /* custom cursor */
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    let ringX = 0
    let ringY = 0
    let mouseX = 0
    let mouseY = 0
    let raf = 0

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      if (cursorDot.current) {
        cursorDot.current.style.transform = `translate(${mouseX}px, ${mouseY}px)`
      }
      const target = (e.target as HTMLElement).closest('[data-cursor="hover"], a, button, input, label')
      document.body.classList.toggle('cursor-active', Boolean(target))
    }

    const loop = () => {
      ringX += (mouseX - ringX) * 0.16
      ringY += (mouseY - ringY) * 0.16
      if (cursorRing.current) {
        cursorRing.current.style.transform = `translate(${ringX}px, ${ringY}px)`
      }
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  const copyAccount = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NUMBER)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }, [])

  const navigate = (hash: string) => {
    setMenuOpen(false)
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
  }

  const onOrderSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const count = Number(orderForm.ticket_count)

    if (!orderForm.customer_name.trim()) {
      setCheckoutState({ tone: 'err', text: 'Vyplňte prosím jméno a příjmení.' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderForm.customer_email)) {
      setCheckoutState({ tone: 'err', text: 'Zadejte platný e-mail pro potvrzení objednávky.' })
      return
    }
    if (!Number.isFinite(count) || count < 1 || count > Math.max(apiStats.remaining_tickets, 1)) {
      setCheckoutState({ tone: 'err', text: `Vyberte počet vstupenek od 1 do ${apiStats.remaining_tickets}.` })
      return
    }

    setIsSubmitting(true)
    setCreatedOrder(null)
    setCheckoutState({ tone: 'ok', text: 'Vytvářím objednávku a připravuji platební instrukce…' })

    try {
      const orderRes = await fetch(`${API_BASE_URL}/api/tickets/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: orderForm.customer_name,
          customer_email: orderForm.customer_email,
          ticket_count: count,
        }),
      })

      const orderData = await orderRes.json().catch(() => null)
      if (!orderRes.ok) {
        throw new Error(orderData?.detail || 'Objednávku se nepodařilo vytvořit.')
      }

      const instructions = orderData?.payment_instructions
      if (!instructions) {
        throw new Error('Platební instrukce nebyly vráceny.')
      }

      setCreatedOrder({
        order_number: orderData.order_number,
        amount: Number(orderData.amount ?? 0),
        expires_at: String(instructions.expires_at ?? ''),
        variable_symbol: String(instructions.variable_symbol ?? ''),
        account_number: String(instructions.account_number ?? ACCOUNT_NUMBER),
        message: String(instructions.message ?? ''),
      })
      setCheckoutState({
        tone: 'ok',
        text: `Objednávka ${orderData.order_number} byla vytvořena. Zkontrolujte platební údaje níže.`,
      })
      await loadTicketStats()
    } catch (error) {
      setCheckoutState({
        tone: 'err',
        text: error instanceof Error ? error.message : 'Něco se nepodařilo. Zkuste to prosím znovu.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page">
      {/* chrome */}
      <div className="cursor-dot" ref={cursorDot} aria-hidden="true" />
      <div className="cursor-ring" ref={cursorRing} aria-hidden="true" />
      <div className="progress-bar" style={{ transform: `scaleX(${scrollProgress})` }} aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      {/* nav */}
      <header className="nav">
        <a
          href={APP_URL}
          className="nav-brand"
          data-cursor="hover"
          aria-label={`Doména aplikace: ${APP_DOMAIN}`}
          onClick={(e) => { e.preventDefault(); navigate('#hero') }}
        >
          <span className="nav-brand-mark">PZN</span>
          <span className="nav-brand-name">{APP_NAME}</span>
        </a>

        <nav className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label="Hlavní navigace">
          {[
            ['#artists', 'Umělci'],
            ['#program', 'Program'],
            ['#tickets', 'Vstupenky'],
            ['#partners', 'Partneři'],
            ['#contact', 'Kontakt'],
          ].map(([hash, label]) => (
            <a
              key={hash}
              href={hash}
              data-cursor="hover"
              onClick={(e) => {
                e.preventDefault()
                navigate(hash)
              }}
            >
              <span data-text={label}>{label}</span>
            </a>
          ))}
        </nav>

        <button
          className={`nav-burger ${menuOpen ? 'is-open' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Zavřít menu' : 'Otevřít menu'}
          aria-expanded={menuOpen}
        >
          <span />
          <span />
        </button>
      </header>

      <main>
        {/* ================= hero ================= */}
        <section id="hero" className="hero" ref={heroRef}>
          <div className="hero-bg" aria-hidden="true">
            <div className="hero-orb hero-orb-a" />
            <div className="hero-orb hero-orb-b" />
            <div className="hero-lines" />
          </div>

          <div className="hero-stage">
            <div className="hero-main">
              <p className="hero-eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                Benefiční koncert pro {APP_NAME.toLowerCase()}
              </p>

              <h1 className="hero-title" aria-label="Hudba a slova, která probouzejí a upevňují zdraví národa.">
                <span className="hero-line">
                  <span className="hero-line-inner">Hudba a slova,</span>
                </span>
                <span className="hero-line hero-line-serif">
                  <span className="hero-line-inner">
                    která <em>probouzejí</em>
                  </span>
                </span>
                <span className="hero-line">
                  <span className="hero-line-inner">
                    a <span className="hero-accent">upevňují</span>
                  </span>
                </span>
                <span className="hero-line">
                  <span className="hero-line-inner">zdraví národa.</span>
                </span>
              </h1>

            </div>

            <figure className="hero-portrait">
              <div className="hero-portrait-frame" ref={heroPortraitRef} data-cursor="hover">
                <img
                  className="hero-portrait-image"
                  src={encodeURI('/images/Výstřižek.JPG')}
                  alt="Karel IV"
                />
                <div className="hero-portrait-glare" aria-hidden="true" />
                <span className="hero-portrait-tag" aria-hidden="true">
                  Patron Koncertu
                </span>
              </div>
              <figcaption>
                <strong>Karel IV.</strong>
                <span>Patron koncertu</span>
              </figcaption>
            </figure>
          </div>

          <div className="hero-audience" role="note" aria-label="Pro koho je akce">
            <div className="hero-audience-copy">
              <span className="hero-patron-label">Pro koho to je</span>
              <h3>Pro všechny, kdo chtějí společně podpořit zdraví národa a posílit společnou odpovědnost.</h3>
            </div>
            <div className="hero-audience-portrait">
              <div className="hero-portrait-frame hero-portrait-frame-small" aria-hidden="true">
                <div className="hero-portrait-visual">
                  <img
                    className="hero-portrait-photo"
                    src={encodeURI('/images/Strejček Alfred 15.JPG')}
                    alt=""
                  />
                  <span className="hero-portrait-rings" />
                  <span className="hero-portrait-glow" />
                </div>
              </div>
            </div>
          </div>

          <div className="hero-lower">
            <p className="hero-text">
              Benefiční kulturní večer, který propojuje hudbu, slova a solidaritu. Každá vstupenka
              i&nbsp;dar pomáhá vytvářet prostor pro zdraví, vzájemnou podporu a přímou pomoc.
            </p>

            <div className="hero-cta">
              <MagneticButton href="#tickets">Koupit vstupenku</MagneticButton>
              <MagneticButton href="#account" variant="ghost">
                Přispět na účet
              </MagneticButton>
            </div>
          </div>

          <div className="hero-meta" role="list" aria-label="Detaily koncertu">
            <div role="listitem">
              <span>Datum</span>
              <strong>21.10.2026</strong>
            </div>
            <div role="listitem">
              <span>Místo</span>
              <strong>{EVENT_LOCATION}</strong>
            </div>
            <div role="listitem">
              <span>Vstupné</span>
              <strong>{formatMoney(apiStats.price_per_ticket)}</strong>
            </div>
            <div role="listitem">
              <span>Kapacita</span>
              <strong>{apiStats.total_tickets} sedadel / {liveStandingTickets} stání</strong>
            </div>
          </div>

          <div className="hero-scroll-hint" aria-hidden="true">
            <span>scroll</span>
            <div className="scroll-line" />
          </div>
        </section>

        {/* ================= marquee ================= */}
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {Array.from({ length: 2 }).map((_, i) => (
              <div className="marquee-group" key={i}>
                <span>CROWD CAFE</span>
                <span className="marquee-star">✦</span>
                <span>{EVENT_DATE}</span>
                <span className="marquee-star">✦</span>
                <span>Benefiční koncert</span>
                <span className="marquee-star">✦</span>
                <span>{APP_NAME}</span>
                <span className="marquee-star">✦</span>
              </div>
            ))}
          </div>
        </div>

        {/* ================= artists ================= */}
        <ArtistsSection />

        {/* ================= about ================= */}
        <section className="section about" id="about">
          <Reveal className="section-head">
            <span className="section-index">02</span>
            <KineticHeading text="O koncertu" className="section-title" />
          </Reveal>
          <Reveal className="about-body" delay={120}>
            <p className="about-lead">
              <em>Pro zdraví národa</em> je benefiční kulturní večer, který propojuje uměleckou
              kvalitu s&nbsp;jasným posláním.
            </p>
            <p className="about-lead">
              <em>Vytváříme tak prostor</em>, kde podpora dostává konkrétní podobu a každý host je součástí
              skutečné pomoci.
            </p>
            <p className="about-lead">
              <em>Zdraví národa začíná</em> u jednotlivce ukotveného a znalého svých kořenů a odpovědného
              k odkazu předků.
            </p>
            <div className="about-stats" role="list">
              <div role="listitem">
                <strong>
                  <CountUp target={soldPercentage} />
                  <span className="stat-unit">%</span>
                </strong>
                <span>vstupenek prodáno</span>
              </div>
              <div role="listitem">
                <strong>
                  <CountUp target={apiStats.total_tickets} />
                </strong>
                <span>sedadel celkem</span>
              </div>
              <div role="listitem">
                <strong>
                  <CountUp target={liveStandingTickets} />
                </strong>
                <span>míst na stání</span>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ================= ways to help ================= */}
        <section className="section ways">
          <Reveal className="section-head">
            <span className="section-index">03</span>
            <KineticHeading text="Jak můžete pomoci" className="section-title" />
          </Reveal>
          <div className="ways-grid">
            {helpWays.map((way, i) => (
              <Reveal key={way.index} delay={i * 90}>
                <article className="way-card" data-cursor="hover">
                  <span className="way-index">{way.index}</span>
                  <h3>{way.title}</h3>
                  <p>{way.text}</p>
                  <span className="way-arrow" aria-hidden="true">
                    →
                  </span>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================= account ================= */}
        <section className="section account" id="account">
          <Reveal className="account-inner">
            <div className="account-copy">
              <span className="section-index">04</span>
              <KineticHeading text="Transparentní účet" className="section-title" />
              <p>
                Naskenujte QR kód nebo použijte číslo účtu. Dar je možné odeslat během
                několika sekund — a&nbsp;každá koruna je veřejně dohledatelná.
              </p>
              <button className="account-number" onClick={copyAccount} data-cursor="hover" type="button">
                <span className="account-digits">{ACCOUNT_NUMBER}</span>
                <span className={`account-copy-state ${copied ? 'is-copied' : ''}`}>
                  {copied ? '✓ Zkopírováno' : 'Kliknutím zkopírovat'}
                </span>
              </button>
            </div>
            <div className="qr-card" ref={portraitRef} aria-label="QR kód pro dar">
              <div className="qr-glare" aria-hidden="true" />
              <img className="qr-visual" src="/images/qr.png" alt="QR kód pro dar" />
              <p>Dobrovolný dar</p>
            </div>
          </Reveal>
        </section>

        {/* ================= program ================= */}
        <section className="section program" id="program">
          <Reveal className="section-head">
            <span className="section-index">05</span>
            <KineticHeading text="Program večera" className="section-title" />
          </Reveal>
          <div className="timeline" role="list" aria-label="Program koncertu">
            {timeline.map((item, i) => (
              <Reveal key={item.time} delay={i * 110}>
                <article className="timeline-item" role="listitem" data-cursor="hover">
                  <time>{item.time}</time>
                  <div className="timeline-node" aria-hidden="true" />
                  <div className="timeline-body">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================= tickets ================= */}
        <section className="section tickets" id="tickets">
          <Reveal className="tickets-inner">
            <div className="ticket-card" aria-hidden="true">
              <div className="ticket-punch ticket-punch-l" />
              <div className="ticket-punch ticket-punch-r" />
              <p className="ticket-brand">{APP_NAME}</p>
              <strong className="ticket-price">{formatMoney(apiStats.price_per_ticket)}</strong>
              <span className="ticket-meta">{EVENT_DATE} — 18:00 — {EVENT_LOCATION}</span>
              <div className="ticket-barcode">
                {Array.from({ length: 28 }).map((_, i) => (
                  <span key={i} style={{ width: `${((i * 13) % 4) + 1}px` }} />
                ))}
              </div>
            </div>

            <div className="tickets-copy">
              <span className="section-index">06</span>
              <KineticHeading text="Vstupenky" className="section-title" />
              <ul className="tickets-list">
                <li>
                  <span>Datum</span>
                  <strong>{EVENT_DATE}</strong>
                </li>
                <li>
                  <span>Čas</span>
                  <strong>{EVENT_TIME}</strong>
                </li>
                <li>
                  <span>Místo</span>
                  <strong>{EVENT_LOCATION}</strong>
                </li>
                <li>
                  <span>Kapacita</span>
                  <strong>{apiStats.total_tickets} sedadel / {liveStandingTickets} na stání</strong>
                </li>
              </ul>

              <div className="capacity" aria-live="polite">
                <div className="capacity-label">
                  <span>
                    Prodáno {apiStats.sold_tickets} / {apiStats.total_tickets}
                  </span>
                  <strong>{soldPercentage}%</strong>
                </div>
                <div className="capacity-track" aria-hidden="true">
                  <span className="capacity-fill" style={{ width: `${soldPercentage}%` }} />
                </div>
              </div>

              <form className="ticket-order-form" id="ticket-order-form" onSubmit={onOrderSubmit}>
                <h3>Rezervace vstupenek</h3>

                <div className="field">
                  <input
                    id="ticket-name"
                    name="ticket-name"
                    value={orderForm.customer_name}
                    onChange={(e) => setOrderForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                    placeholder=" "
                    autoComplete="name"
                  />
                  <label htmlFor="ticket-name">Jméno a příjmení</label>
                </div>

                <div className="field">
                  <input
                    id="ticket-email"
                    name="ticket-email"
                    type="email"
                    value={orderForm.customer_email}
                    onChange={(e) => setOrderForm((prev) => ({ ...prev, customer_email: e.target.value }))}
                    placeholder=" "
                    autoComplete="email"
                  />
                  <label htmlFor="ticket-email">E-mail</label>
                </div>

                <div className="field">
                  <input
                    id="ticket-count"
                    name="ticket-count"
                    type="number"
                    min={1}
                    max={Math.max(apiStats.remaining_tickets, 1)}
                    value={orderForm.ticket_count}
                    onChange={(e) => setOrderForm((prev) => ({ ...prev, ticket_count: Number(e.target.value) || 1 }))}
                    placeholder=" "
                  />
                  <label htmlFor="ticket-count">Počet vstupenek</label>
                </div>

                <div className="ticket-summary">
                  <span>{orderForm.ticket_count} vstupenek</span>
                  <strong>{formatMoney(orderForm.ticket_count * apiStats.price_per_ticket)}</strong>
                </div>

                <MagneticButton type="submit">
                  {isSubmitting ? 'Připravují se instrukce…' : `Koupit vstupenku — ${formatMoney(orderForm.ticket_count * apiStats.price_per_ticket)}`}
                </MagneticButton>

                {checkoutState && (
                  <p className={`form-feedback is-${checkoutState.tone}`} role="status">
                    {checkoutState.text}
                  </p>
                )}

                {createdOrder && (
                  <div className="order-instructions" role="status" aria-live="polite">
                    <h4>Platební instrukce</h4>
                    <p>
                      Objednávka <strong>{createdOrder.order_number}</strong>
                    </p>
                    <ul>
                      <li>
                        Účet: <strong>{createdOrder.account_number}</strong>
                      </li>
                      <li>
                        Částka: <strong>{formatMoney(createdOrder.amount)}</strong>
                      </li>
                      <li>
                        Variabilní symbol: <strong>{createdOrder.variable_symbol}</strong>
                      </li>
                      <li>
                        Zpráva: <strong>{createdOrder.message || createdOrder.order_number}</strong>
                      </li>
                      <li>
                        Uhradit do: <strong>{new Date(createdOrder.expires_at).toLocaleString('cs-CZ')}</strong>
                      </li>
                    </ul>
                    <p>
                      Po přijetí platby vám automaticky přijde e-mail s PDF vstupenkou.
                    </p>
                  </div>
                )}
              </form>
            </div>
          </Reveal>
        </section>

        {/* ================= partners ================= */}
        <section className="section partners" id="partners">
          <Reveal className="section-head">
            <span className="section-index">08</span>
            <KineticHeading text="Partneři" className="section-title" />
          </Reveal>
          <div className="partners-grid" role="list" aria-label="Partneři akce">
            {partners.map((partner, i) => (
              <Reveal key={partner.name} delay={i * 60}>
                <article className="partner-cell" role="listitem" data-cursor="hover">
                  {partner.url && partner.url !== '#' ? (
                    <a href={partner.url} target="_blank" rel="noreferrer">
                      <span>{partner.name}</span>
                    </a>
                  ) : (
                    <span>{partner.name}</span>
                  )}
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal className="patron-spiritual" delay={140}>
            <h3 className="patron-spiritual-heading">Duchovní záštita celého projektu</h3>
            <a
              className="patron-spiritual-card"
              href={spiritualPatron.url}
              target="_blank"
              rel="noreferrer"
              data-cursor="hover"
            >
              <span className="patron-spiritual-emblem" aria-hidden="true">
                <img className="patron-spiritual-cross" src="/images/templar_cross_white-bkg.png" alt="" />
              </span>
              <span className="patron-spiritual-copy">
                <strong className="patron-spiritual-order">{spiritualPatron.order}</strong>
                <span className="patron-spiritual-komenda">{spiritualPatron.komenda}</span>
              </span>
            </a>
          </Reveal>

          <Reveal className="patrons-wrap" delay={180}>
            <div className="patrons-copy">
              <h3>Pokračování projektu „{APP_NAME}“</h3>
              <h4>Patroni následujících koncertů:</h4>
              <div className="patrons-list" role="list" aria-label="Patroni koncertů">
                {projectPatrons.map((patron) => (
                  <a key={patron.year} href={patron.url} target="_blank" rel="noreferrer" role="listitem">
                    <span>{patron.year}</span>
                    <strong>{patron.name}</strong>
                  </a>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ================= contact / footer CTA ================= */}
        <section className="section contact" id="contact">
          <Reveal>
            <KineticHeading text="Buďte u toho." as="h2" className="contact-title" />
            <p className="contact-sub">Každá vstupenka je konkrétní pomoc.</p>
            <div className="contact-cta">
              <MagneticButton href="#tickets">Koupit vstupenku</MagneticButton>
            </div>
            <address className="contact-details">
              <a href={`mailto:${EVENT_EMAIL}`} data-cursor="hover">
                {EVENT_EMAIL}
              </a>
            </address>
          </Reveal>
        </section>
      </main>

      <a className="mobile-cta" href="#tickets">
        Koupit vstupenku — {formatMoney(apiStats.price_per_ticket)}
      </a>

      <footer className="footer">
        <p>{APP_NAME} © 2026</p>
        <a
          href="#hero"
          data-cursor="hover"
          onClick={(e) => {
            e.preventDefault()
            navigate('#hero')
          }}
        >
          Zpět nahoru ↑
        </a>
      </footer>
    </div>
  )
}

/** Artists roster — big-name list with cursor-chasing preview card */
function ArtistsSection() {
  const [active, setActive] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  /* preview follows the cursor with lerp + velocity tilt */
  useEffect(() => {
    const list = listRef.current
    const preview = previewRef.current
    if (!list || !preview || window.matchMedia('(pointer: coarse)').matches) return

    const onMove = (e: MouseEvent) => {
      const rect = list.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const tiltZ = Math.max(Math.min((x - rect.width / 2) * 0.08, 12), -12)
      preview.style.left = `${x}px`
      preview.style.top = `${y}px`
      preview.style.transform = `translate(-50%, -50%) rotate(${tiltZ}deg)`
    }

    list.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      list.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <section className="section artists" id="artists">
      <Reveal className="section-head">
        <span className="section-index">01</span>
        <KineticHeading text="Účinkující" className="section-title" />
      </Reveal>

      <Reveal delay={100}>
        <p className="artists-lead">
          Na jednom pódiu se pro Alfreda spojí jeho <em>přátelé a kolegové</em> z jeviště.
        </p>
      </Reveal>

      <div
        className={`artists-list ${active !== null ? 'has-active' : ''}`}
        ref={listRef}
        onMouseLeave={() => setActive(null)}
        role="list"
        aria-label="Vystupující umělci"
      >
        {artists.map((artist, i) => (
          <Reveal key={artist.name} delay={i * 80}>
            <article
              className={`artist-row ${active === i ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              role="listitem"
              tabIndex={0}
              data-cursor="hover"
            >
              <span className="artist-index" aria-hidden="true">
                {pad(i + 1)}
              </span>
              <h3 className="artist-name">
                <span className="artist-name-inner" data-text={artist.name}>
                  {artist.name}
                </span>
              </h3>
              <div className="artist-meta">
                <span className="artist-role">{artist.role}</span>
                <span className="artist-detail">{artist.detail}</span>
              </div>
              <span className="artist-arrow" aria-hidden="true">
                ✦
              </span>
            </article>
          </Reveal>
        ))}

        <div className={`artist-preview ${active !== null ? 'is-on' : ''}`} ref={previewRef} aria-hidden="true">
          {artists.map((artist, i) => (
            <div
              key={artist.name}
              className={`artist-preview-card ${active === i ? 'is-current' : ''}`}
              style={{ '--artist-hue': artist.hue } as CSSProperties}
            >
              <img
                className="artist-preview-photo"
                src={artist.image}
                alt=""
                style={{ objectPosition: artist.imagePosition ?? 'center' }}
              />
              <span className="artist-preview-role">{artist.role}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default App
