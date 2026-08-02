import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'

/* ============================== data ============================== */

const TOTAL_TICKETS = 120
const SOLD_TICKETS = 74
const TICKET_PRICE = 1490
const ACCOUNT_NUMBER = '2602456719/2010'
const AUCTION_END = '2026-11-20T20:30:00+01:00'

type AuctionItem = {
  title: string
  description: string
  highestBid: number
}

const auctionItems: AuctionItem[] = [
  {
    title: 'Podepsaný koncertní program',
    description: 'Limitovaná edice s osobním věnováním Alfréda Strejčka.',
    highestBid: 18500,
  },
  {
    title: 'Komorní večer pro dva',
    description: 'Setkání s umělci po skončení koncertu.',
    highestBid: 24200,
  },
  {
    title: 'Originální fotografie z příprav',
    description: 'Autorský tisk v galerijní kvalitě, číslovaná série.',
    highestBid: 11900,
  },
]

const timeline = [
  { time: '18:00', title: 'Otevření foyer', detail: 'Přivítání hostů a úvodní networking.' },
  { time: '19:00', title: 'Zahájení večera', detail: 'Slovo organizátorů a představení poslání akce.' },
  { time: '19:30', title: 'Hlavní koncert', detail: 'Benefiční hudební vystoupení věnované podpoře léčby.' },
  { time: '21:00', title: 'Závěr a poděkování', detail: 'Finální vyúčtování pomoci a vyhlášení aukce.' },
]

const partners = [
  'Nadace Harmonie',
  'Město Praha',
  'Kulturní Forum',
  'Studio Forte',
  'Mecenáši Plus',
  'Nadace Světlo',
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
    title: 'Zapojit se do aukce',
    text: 'Unikátní předměty v online aukci navýší celkovou částku podpory.',
  },
  {
    index: '04',
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

const formatCountdown = (targetDate: string) => {
  const diff = Math.max(new Date(targetDate).getTime() - Date.now(), 0)
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: diff === 0,
  }
}

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

/** Flip-style countdown unit */
function CountUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="count-unit">
      <span className="count-value" key={value}>
        {pad(value)}
      </span>
      <span className="count-label">{label}</span>
    </div>
  )
}

function MagneticButton({
  children,
  href,
  variant = 'primary',
  onClick,
  type,
}: {
  children: ReactNode
  href?: string
  variant?: 'primary' | 'ghost'
  onClick?: () => void
  type?: 'button' | 'submit'
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
      <a className={`btn btn-${variant}`} href={href} data-cursor="hover">
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
  const [countdown, setCountdown] = useState(formatCountdown(AUCTION_END))
  const [currentBid, setCurrentBid] = useState(26500)
  const [bidName, setBidName] = useState('')
  const [bidAmount, setBidAmount] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const [bidFeedback, setBidFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const cursorDot = useRef<HTMLDivElement | null>(null)
  const cursorRing = useRef<HTMLDivElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const portraitRef = useTilt<HTMLDivElement>(5)

  const soldPercentage = useMemo(
    () => Math.min(Math.round((SOLD_TICKETS / TOTAL_TICKETS) * 100), 100),
    [],
  )

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

  /* countdown tick */
  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(formatCountdown(AUCTION_END)), 1000)
    return () => window.clearInterval(timer)
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

  const submitBid = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedBid = Number(bidAmount)

    if (!isAdult) {
      setBidFeedback({ tone: 'err', text: 'Pro přihazování je nutné potvrdit věk 18+.' })
      return
    }
    if (!bidName.trim()) {
      setBidFeedback({ tone: 'err', text: 'Vyplňte prosím jméno přihazujícího.' })
      return
    }
    if (!Number.isFinite(parsedBid) || parsedBid <= currentBid) {
      setBidFeedback({ tone: 'err', text: `Nová nabídka musí být vyšší než ${formatMoney(currentBid)}.` })
      return
    }

    setCurrentBid(parsedBid)
    setBidAmount('')
    setBidFeedback({ tone: 'ok', text: 'Příhoz úspěšně zaznamenán. Děkujeme za podporu!' })
  }

  const navigate = (hash: string) => {
    setMenuOpen(false)
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
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
        <a href="#hero" className="nav-brand" data-cursor="hover" onClick={(e) => { e.preventDefault(); navigate('#hero') }}>
          <span className="nav-brand-mark">PZN</span>
          <span className="nav-brand-name">Pro zdraví národa</span>
        </a>

        <nav className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label="Hlavní navigace">
          {[
            ['#program', 'Program'],
            ['#tickets', 'Vstupenky'],
            ['#auction', 'Aukce'],
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

          <p className="hero-eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            Benefiční koncert na podporu Alfréda Strejčka
          </p>

          <h1 className="hero-title" aria-label="Hudba, která mění skutečné příběhy.">
            <span className="hero-line">
              <span className="hero-line-inner">Hudba,</span>
            </span>
            <span className="hero-line hero-line-serif">
              <span className="hero-line-inner">
                která <em>mění</em>
              </span>
            </span>
            <span className="hero-line">
              <span className="hero-line-inner">
                skutečné <span className="hero-accent">příběhy.</span>
              </span>
            </span>
          </h1>

          <div className="hero-lower">
            <p className="hero-text">
              Výjimečný večer spojující umění, solidaritu a lidskost. Každá vstupenka
              i&nbsp;dar pomáhají přímo tam, kde je to potřeba.
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
              <strong>20. 11. 2026</strong>
            </div>
            <div role="listitem">
              <span>Místo</span>
              <strong>Rudolfinum, Praha</strong>
            </div>
            <div role="listitem">
              <span>Vstupné</span>
              <strong>{formatMoney(TICKET_PRICE)}</strong>
            </div>
            <div role="listitem">
              <span>Kapacita</span>
              <strong>{TOTAL_TICKETS} míst</strong>
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
                <span>Rudolfinum</span>
                <span className="marquee-star">✦</span>
                <span>20. listopadu 2026</span>
                <span className="marquee-star">✦</span>
                <span>Benefiční koncert</span>
                <span className="marquee-star">✦</span>
                <span>Pro zdraví národa</span>
                <span className="marquee-star">✦</span>
              </div>
            ))}
          </div>
        </div>

        {/* ================= about ================= */}
        <section className="section about" id="about">
          <Reveal className="section-head">
            <span className="section-index">01</span>
            <KineticHeading text="O koncertu" className="section-title" />
          </Reveal>
          <Reveal className="about-body" delay={120}>
            <p className="about-lead">
              <em>Pro zdraví národa</em> je benefiční kulturní večer, který propojuje uměleckou
              kvalitu s&nbsp;jasným posláním. Vytváříme prostor, kde podpora dostává konkrétní
              podobu a&nbsp;každý host je součástí skutečné pomoci.
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
                  <CountUp target={TOTAL_TICKETS} />
                </strong>
                <span>míst celkem</span>
              </div>
              <div role="listitem">
                <strong>
                  <CountUp target={currentBid} duration={1800} />
                  <span className="stat-unit">Kč</span>
                </strong>
                <span>nejvyšší příhoz v aukci</span>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ================= ways to help ================= */}
        <section className="section ways">
          <Reveal className="section-head">
            <span className="section-index">02</span>
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
              <span className="section-index">03</span>
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
              <a className="text-link" href="https://www.fio.cz" target="_blank" rel="noreferrer" data-cursor="hover">
                Otevřít transparentní účet
                <span aria-hidden="true"> ↗</span>
              </a>
            </div>
            <div className="qr-card" ref={portraitRef} aria-label="QR kód pro dar">
              <div className="qr-glare" aria-hidden="true" />
              <div className="qr-visual" aria-hidden="true">
                {Array.from({ length: 64 }).map((_, i) => (
                  <span key={i} className={(i * 7 + 3) % 5 < 3 ? 'qr-cell is-on' : 'qr-cell'} />
                ))}
              </div>
              <p>Dobrovolný dar</p>
            </div>
          </Reveal>
        </section>

        {/* ================= program ================= */}
        <section className="section program" id="program">
          <Reveal className="section-head">
            <span className="section-index">04</span>
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
              <p className="ticket-brand">Pro zdraví národa</p>
              <strong className="ticket-price">{formatMoney(TICKET_PRICE)}</strong>
              <span className="ticket-meta">20.&nbsp;11.&nbsp;2026 — 19:00 — Rudolfinum</span>
              <div className="ticket-barcode">
                {Array.from({ length: 28 }).map((_, i) => (
                  <span key={i} style={{ width: `${((i * 13) % 4) + 1}px` }} />
                ))}
              </div>
            </div>

            <div className="tickets-copy">
              <span className="section-index">05</span>
              <KineticHeading text="Vstupenky" className="section-title" />
              <ul className="tickets-list">
                <li>
                  <span>Datum</span>
                  <strong>20. listopadu 2026</strong>
                </li>
                <li>
                  <span>Čas</span>
                  <strong>19:00 (otevření 18:00)</strong>
                </li>
                <li>
                  <span>Místo</span>
                  <strong>Rudolfinum, Praha</strong>
                </li>
                <li>
                  <span>Sezení</span>
                  <strong>Volné, kapacita {TOTAL_TICKETS} osob</strong>
                </li>
              </ul>

              <div className="capacity" aria-live="polite">
                <div className="capacity-label">
                  <span>
                    Prodáno {SOLD_TICKETS} / {TOTAL_TICKETS}
                  </span>
                  <strong>{soldPercentage}%</strong>
                </div>
                <div className="capacity-track" aria-hidden="true">
                  <span className="capacity-fill" style={{ width: `${soldPercentage}%` }} />
                </div>
              </div>

              <MagneticButton href="#">Koupit vstupenku — {formatMoney(TICKET_PRICE)}</MagneticButton>
            </div>
          </Reveal>
        </section>

        {/* ================= auction ================= */}
        <section className="section auction" id="auction">
          <Reveal className="section-head">
            <span className="section-index">06</span>
            <KineticHeading text="Online aukce" className="section-title" />
          </Reveal>

          <Reveal className="auction-countdown" delay={100}>
            {countdown.done ? (
              <p className="countdown-done">Aukce byla ukončena.</p>
            ) : (
              <div className="count-grid" aria-live="polite" aria-label="Odpočet do konce aukce">
                <CountUnit value={countdown.days} label="dní" />
                <span className="count-sep" aria-hidden="true">:</span>
                <CountUnit value={countdown.hours} label="hodin" />
                <span className="count-sep" aria-hidden="true">:</span>
                <CountUnit value={countdown.minutes} label="minut" />
                <span className="count-sep" aria-hidden="true">:</span>
                <CountUnit value={countdown.seconds} label="sekund" />
              </div>
            )}
            <p className="auction-end-note">Ukončení: 20. listopadu 2026 ve 20:30</p>
          </Reveal>

          <div className="auction-grid" role="list" aria-label="Dražené předměty">
            {auctionItems.map((item, i) => (
              <Reveal key={item.title} delay={i * 100}>
                <AuctionCard item={item} currentBid={currentBid} />
              </Reveal>
            ))}
          </div>

          <Reveal className="bid-wrap" delay={150}>
            <form className="bid-form" onSubmit={submitBid}>
              <h3>Přihodit v aukci</h3>
              <div className="field">
                <input
                  id="bid-name"
                  name="bid-name"
                  value={bidName}
                  onChange={(e) => setBidName(e.target.value)}
                  placeholder=" "
                  autoComplete="name"
                />
                <label htmlFor="bid-name">Vaše jméno</label>
              </div>

              <div className="field">
                <input
                  id="bid-amount"
                  name="bid-amount"
                  type="number"
                  min={currentBid + 1}
                  step="100"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  placeholder=" "
                />
                <label htmlFor="bid-amount">Výše příhozu (min. {formatMoney(currentBid + 100)})</label>
              </div>

              <label className="checkbox-row" htmlFor="adult-check" data-cursor="hover">
                <input
                  id="adult-check"
                  name="adult-check"
                  type="checkbox"
                  checked={isAdult}
                  onChange={(e) => setIsAdult(e.target.checked)}
                />
                <span className="checkbox-box" aria-hidden="true" />
                Potvrzuji, že mi je 18 a více let.
              </label>

              <MagneticButton type="submit">Potvrdit příhoz</MagneticButton>

              {bidFeedback && (
                <p className={`form-feedback is-${bidFeedback.tone}`} role="status">
                  {bidFeedback.text}
                </p>
              )}
            </form>
          </Reveal>
        </section>

        {/* ================= partners ================= */}
        <section className="section partners" id="partners">
          <Reveal className="section-head">
            <span className="section-index">07</span>
            <KineticHeading text="Partneři" className="section-title" />
          </Reveal>
          <div className="partners-grid" role="list" aria-label="Partneři akce">
            {partners.map((partner, i) => (
              <Reveal key={partner} delay={i * 60}>
                <article className="partner-cell" role="listitem" data-cursor="hover">
                  <span>{partner}</span>
                </article>
              </Reveal>
            ))}
          </div>
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
              <a href="mailto:info@prozdravinaroda.cz" data-cursor="hover">
                info@prozdravinaroda.cz
              </a>
              <a href="tel:+420777123456" data-cursor="hover">
                +420 777 123 456
              </a>
            </address>
          </Reveal>
        </section>
      </main>

      <a className="mobile-cta" href="#tickets">
        Koupit vstupenku — {formatMoney(TICKET_PRICE)}
      </a>

      <footer className="footer">
        <p>Pro zdraví národa © 2026</p>
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

function AuctionCard({ item, currentBid }: { item: AuctionItem; currentBid: number }) {
  const ref = useTilt<HTMLElement>(6)
  return (
    <article className="auction-card" ref={ref} role="listitem" data-cursor="hover">
      <div className="auction-glare" aria-hidden="true" />
      <div className="auction-visual" aria-hidden="true">
        <span className="auction-visual-mark">✦</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <div className="auction-bid">
        <span>Aktuální nabídka</span>
        <strong>{formatMoney(Math.max(item.highestBid, currentBid))}</strong>
      </div>
    </article>
  )
}

export default App
