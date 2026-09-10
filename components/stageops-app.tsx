"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Drum,
  Guitar,
  LoaderCircle,
  Mic,
  Minus,
  Package,
  Piano,
  Plus,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
  Speaker,
  Sparkles,
  X,
} from "lucide-react";
import { ru } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  categories,
  products as initialProducts,
  isoDate,
  parseDate,
  rentalWindow,
  rangeLabel,
  shortDate,
  type CartLine,
  type CategoryId,
  type RentalRange,
  type Product,
} from "@/lib/catalog";
import type { DateRange } from "react-day-picker";

type View = "categories" | "products" | "dates" | "contact" | "success" | "ops";
type Contact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};
type Receipt = { number: string; createdAt: string; items: number };
type Stock = {
  productId: string;
  total: number;
  inWarehouse: number;
  circulating: number;
  reserved: number;
  firstFree: string | null;
};
type Ops = {
  stock: Stock[];
  orders: {
    number: string;
    customer: string;
    createdAt: string;
    lines: number;
  }[];
  purchases: {
    id: string;
    number: string;
    productId: string;
    quantity: number;
    neededBy: string;
    endDate: string;
    status: string;
  }[];
  scenarioMonth: string;
};
const emptyContact: Contact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

function ProductIcon({ product }: { product: Product }) {
  if (product.id.startsWith("mic") || product.id.startsWith("stand"))
    return <Mic />;
  if (product.id.startsWith("mixer")) return <SlidersHorizontal />;
  if (product.id.startsWith("keys")) return <Piano />;
  if (product.id.startsWith("drums")) return <Drum />;
  if (product.id.startsWith("amp")) return <Guitar />;
  if (product.id.startsWith("cable")) return <AudioLines />;
  return <Speaker />;
}

export default function StageOpsApp({
  operator = false,
}: {
  operator?: boolean;
}) {
  const [view, setView] = useState<View>(operator ? "ops" : "categories");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [category, setCategory] = useState<CategoryId>("sound");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [windowInfo, setWindowInfo] = useState(rentalWindow);
  const [month, setMonth] = useState(() => parseDate(rentalWindow().minDate));
  const [scope, setScope] = useState("all");
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();
  const [globalRange, setGlobalRange] = useState<RentalRange>();
  const [pickingEnd, setPickingEnd] = useState(false);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [receipt, setReceipt] = useState<Receipt>();
  const [busy, setBusy] = useState(operator);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [ops, setOps] = useState<Ops>();
  const [opsTab, setOpsTab] = useState<"stock" | "orders" | "purchases">(
    "stock",
  );
  const [opsPage, setOpsPage] = useState(0);
  const [highlightDemo, setHighlightDemo] = useState(false);
  const requestId = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);

  async function loadCatalog() {
    try {
      const response = await fetch("/api/catalog");
      if (!response.ok)
        throw new Error("Не удалось подключиться. Попробуйте ещё раз.");
      const data = (await response.json()) as {
        products: Product[];
        window: ReturnType<typeof rentalWindow>;
      };
      setProducts(data.products);
      setWindowInfo(data.window);
      setMonth(parseDate(data.window.minDate));
      setReady(true);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      return false;
    }
  }
  async function initialize() {
    const loaded = await loadCatalog();
    if (loaded && operator) await loadOperations();
  }
  useEffect(() => {
    void initialize();
  }, [operator]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [view]);
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);
  const activeCategory = categories.find((item) => item.id === category)!;
  const allDated =
    cart.length > 0 &&
    cart.every(
      (line) => !!line.range && line.range.start >= windowInfo.minDate,
    );
  const step =
    view === "dates" ? 2 : view === "contact" || view === "success" ? 3 : 1;
  function navigate(next: View) {
    setError("");
    setView(next);
  }
  function updateQuantity(id: string, change: number) {
    setCart((current) => {
      const existing = current.find((item) => item.productId === id);
      if (!existing)
        return change > 0
          ? [...current, { productId: id, quantity: 1, range: globalRange }]
          : current;
      const quantity = Math.min(6, existing.quantity + change);
      return quantity <= 0
        ? current.filter((item) => item.productId !== id)
        : current.map((item) =>
            item.productId === id ? { ...item, quantity } : item,
          );
    });
  }
  function selectScope(next: string) {
    setScope(next);
    setPickingEnd(false);
    const range =
      next === "all"
        ? globalRange
        : cart.find((line) => line.productId === next)?.range;
    setDraftRange(
      range
        ? { from: parseDate(range.start), to: parseDate(range.end) }
        : undefined,
    );
    if (range) setMonth(parseDate(range.start));
  }
  function openDates() {
    setCartOpen(false);
    selectScope("all");
    if (!globalRange) setMonth(parseDate(windowInfo.minDate));
    navigate("dates");
  }
  function chooseDay(day: Date, disabled: boolean) {
    if (disabled || isoDate(day) < windowInfo.minDate) return;
    if (!pickingEnd || !draftRange?.from) {
      setDraftRange({ from: day });
      setPickingEnd(true);
      return;
    }
    const first = isoDate(draftRange.from);
    const second = isoDate(day);
    const range = {
      start: first < second ? first : second,
      end: first < second ? second : first,
    };
    setDraftRange({ from: parseDate(range.start), to: parseDate(range.end) });
    setPickingEnd(false);
    if (scope === "all") setGlobalRange(range);
    setCart((current) =>
      current.map((line) =>
        scope === "all" || line.productId === scope ? { ...line, range } : line,
      ),
    );
  }
  function demoContacts() {
    const first = [
      "Александр",
      "Михаил",
      "Никита",
      "Даниил",
      "Артём",
      "Кирилл",
    ];
    const last = ["Волков", "Орлов", "Миронов", "Соколов", "Крылов", "Белов"];
    const random = crypto.getRandomValues(new Uint32Array(3));
    setContact({
      firstName: first[random[0] % first.length],
      lastName: last[random[1] % last.length],
      email: `rental.${random[2].toString(36)}@example.com`,
      phone: `+1 202 555 01${String(random[2] % 100).padStart(2, "0")}`,
    });
    setHighlightDemo(true);
    setTimeout(() => setHighlightDemo(false), 650);
  }
  async function submitOrder(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestId.current,
          contact,
          items: cart,
        }),
      });
      const data = (await response.json()) as Receipt & { error?: string };
      if (!response.ok)
        throw new Error(
          data.error || "Не удалось сохранить заказ. Данные остались в форме.",
        );
      setReceipt(data);
      navigate("success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function finish() {
    setCart([]);
    setGlobalRange(undefined);
    setDraftRange(undefined);
    setContact(emptyContact);
    requestId.current = "";
    setReceipt(undefined);
    navigate("categories");
  }
  async function loadOperations() {
    setBusy(true);
    try {
      const response = await fetch("/api/operations");
      const data = (await response.json()) as Ops & { error?: string };
      if (!response.ok) throw new Error(data.error);
      setOps(data);
    } catch {
      setError("Не удалось загрузить склад. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }
  async function newScenario() {
    setBusy(true);
    try {
      const response = await fetch("/api/scenario", { method: "POST" });
      if (!response.ok) throw new Error();
      setCart([]);
      setGlobalRange(undefined);
      setDraftRange(undefined);
      setContact(emptyContact);
      requestId.current = "";
      await loadCatalog();
      const responseOps = await fetch("/api/operations");
      if (!responseOps.ok) throw new Error();
      setOps((await responseOps.json()) as Ops);
      setOpsPage(0);
    } catch {
      setError("Не удалось создать сценарий.");
    } finally {
      setBusy(false);
    }
  }
  function goBack() {
    if (operator) window.location.assign("/");
    else if (view === "products") navigate("categories");
    else if (view === "dates") navigate("products");
    else if (view === "contact") navigate("dates");
  }
  const opsCount = ops
    ? opsTab === "stock"
      ? ops.stock.length
      : opsTab === "orders"
        ? ops.orders.length
        : ops.purchases.length
    : 0;

  return (
    <main className={`rental-app${operator ? " operator-app" : ""}`}>
      <header className="app-header">
        <button
          className="brand"
          onClick={() =>
            operator ? window.location.assign("/") : navigate("categories")
          }
          aria-label="StageOps, главная"
        >
          <AudioLines size={25} strokeWidth={1.5} />
          <span>
            StageOps<span className="brand-dot">.</span>
          </span>
        </button>
        {!operator && (
          <nav className="step-nav" aria-label="Этапы заказа">
            {["Оборудование", "Даты", "Контакты"].map((label, i) => (
              <span
                key={label}
                className={
                  step === i + 1 ? "current" : step > i + 1 ? "complete" : ""
                }
              >
                <span className="step-dot">
                  {step > i + 1 ? <Check size={11} /> : i + 1}
                </span>
                <span>{label}</span>
                {i < 2 && <span className="step-connector" />}
              </span>
            ))}
          </nav>
        )}
        <div className="header-tools">
          <span className="demo-badge">{operator ? "Оператор" : "Демо"}</span>
        </div>
      </header>
      <section className={`app-screen screen-${view}`} key={view}>
        {view !== "success" && (
          <div className="screen-heading">
            <div className="heading-left">
              {view !== "categories" && (
                <button
                  className="icon-button back-button"
                  onClick={goBack}
                  aria-label="Назад"
                  title="Назад"
                >
                  <ArrowLeft size={23} />
                </button>
              )}
              <div>
                <p className="eyebrow">
                  {view === "ops"
                    ? "ОПЕРАЦИОННЫЙ ЦЕНТР"
                    : `0${step} / АРЕНДА ОБОРУДОВАНИЯ`}
                </p>
                <h1 ref={heading} tabIndex={-1}>
                  {view === "categories"
                    ? "Категории"
                    : view === "products"
                      ? activeCategory.title
                      : view === "dates"
                        ? "Когда понадобится?"
                        : view === "ops"
                          ? "Склад и заявки"
                          : "Оставим связь"}
                </h1>
              </div>
            </div>
            <div className="heading-meta">
              {view === "categories" ? (
                <>
                  <span>343</span> единицы в парке
                </>
              ) : view === "products" ? (
                <>
                  <span>04</span> модели
                </>
              ) : view === "dates" ? (
                <>
                  <span>{units}</span> ед. оборудования
                </>
              ) : view === "contact" ? (
                "Последний шаг"
              ) : (
                <button
                  className="text-button"
                  onClick={() => void newScenario()}
                  disabled={busy}
                >
                  <RotateCcw size={16} /> Новый сценарий
                </button>
              )}
            </div>
          </div>
        )}
        {view === "categories" && (
          <div className="category-columns">
            {categories.map((item, i) => (
              <button
                key={item.id}
                className={`category-column category-${item.id}`}
                onClick={() => {
                  setCategory(item.id);
                  navigate("products");
                }}
              >
                <div className="category-top">
                  <span>0{i + 1}</span>
                  <ArrowRight size={21} strokeWidth={1.4} />
                </div>
                <div className="category-art">
                  <img
                    src={item.image}
                    alt={item.title}
                    width={600}
                    height={600}
                  />
                </div>
                <div className="category-copy">
                  <span className="category-caption">{item.short}</span>
                  <h2>
                    {item.id === "signal" ? (
                      <>Микро&shy;фоны и комму&shy;тация</>
                    ) : (
                      item.title
                    )}
                  </h2>
                  <p>{item.description}</p>
                </div>
                <span className="category-foot">
                  <span>Выбрать оборудование</span>
                  <ArrowRight size={16} />
                </span>
              </button>
            ))}
          </div>
        )}
        {view === "products" && (
          <div className="product-stage">
            <div className="product-grid">
              {products
                .filter((item) => item.category === category)
                .map((product) => {
                  const quantity =
                    cart.find((line) => line.productId === product.id)
                      ?.quantity || 0;
                  return (
                    <article
                      key={product.id}
                      className={`product-tile ${quantity ? "selected" : ""}`}
                    >
                      <button
                        className="product-select"
                        onClick={() =>
                          updateQuantity(product.id, quantity ? -quantity : 1)
                        }
                        aria-label={`${quantity ? "Убрать" : "Добавить"} ${product.name}`}
                        aria-pressed={quantity > 0}
                      >
                        <span className="product-image">
                          <ProductIcon product={product} />
                        </span>
                        <span className="product-copy">
                          <span className="product-kind">{product.kind}</span>
                          <strong>{product.name}</strong>
                          <span>{product.detail}</span>
                        </span>
                        <span className="selection-mark">
                          {quantity ? <Check size={17} /> : <Plus size={18} />}
                        </span>
                      </button>
                      {quantity > 0 && (
                        <div className="tile-quantity">
                          <span>Количество</span>
                          <div className="stepper">
                            <button
                              onClick={() => updateQuantity(product.id, -1)}
                              aria-label={`Уменьшить ${product.name}`}
                            >
                              <Minus size={15} />
                            </button>
                            <span>{quantity}</span>
                            <button
                              onClick={() => updateQuantity(product.id, 1)}
                              disabled={quantity >= 6}
                              aria-label={`Увеличить ${product.name}`}
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
            </div>
            <p className="subtle-note">
              Можно выбрать оборудование из нескольких категорий.
            </p>
          </div>
        )}
        {view === "dates" && (
          <div className="date-stage">
            <aside className="date-settings">
              <p className="field-label">Даты для</p>
              <Select value={scope} onValueChange={selectScope}>
                <SelectTrigger className="scope-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всего оборудования</SelectItem>
                  {cart.map((line) => (
                    <SelectItem key={line.productId} value={line.productId}>
                      {products.find((p) => p.id === line.productId)?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="date-summary">
                <div>
                  <span>Начало аренды</span>
                  <strong>
                    {draftRange?.from
                      ? shortDate(isoDate(draftRange.from))
                      : "Выберите день"}
                  </strong>
                </div>
                <ArrowRight size={18} />
                <div>
                  <span>Последний день</span>
                  <strong>
                    {draftRange?.to
                      ? shortDate(isoDate(draftRange.to))
                      : "Выберите день"}
                  </strong>
                </div>
              </div>
              <p className="date-note">
                {pickingEnd
                  ? "Теперь выберите последний день аренды."
                  : scope === "all"
                    ? "Общие даты применяются ко всей подборке. Для отдельной позиции выберите её в списке."
                    : "Изменения применятся только к этой позиции."}
              </p>
              <div className="date-items">
                {cart.slice(0, 4).map((line) => (
                  <button
                    key={line.productId}
                    className={scope === line.productId ? "active" : ""}
                    onClick={() => selectScope(line.productId)}
                  >
                    <span>
                      {products.find((p) => p.id === line.productId)?.name}
                      <small> × {line.quantity}</small>
                    </span>
                    <span>{rangeLabel(line.range)}</span>
                  </button>
                ))}
                {cart.length > 4 && (
                  <span className="more-items">
                    Ещё {cart.length - 4} позиций в списке выше
                  </span>
                )}
              </div>
            </aside>
            <div className="calendar-stage">
              <Calendar
                mode="range"
                month={month}
                onMonthChange={setMonth}
                selected={draftRange}
                onDayClick={(day, modifiers) =>
                  chooseDay(day, !!modifiers.disabled)
                }
                disabled={{ before: parseDate(windowInfo.minDate) }}
                locale={ru}
                weekStartsOn={1}
                showOutsideDays={false}
                fixedWeeks
                className="rental-calendar"
              />
              <div className="calendar-foot">
                <span>Аренда доступна с {shortDate(windowInfo.minDate)}</span>
                <span>Включая последний день</span>
              </div>
            </div>
          </div>
        )}
        {view === "contact" && (
          <div className="contact-stage">
            <div className="order-recap">
              <span className="recap-icon">
                <ShoppingBag size={28} strokeWidth={1.2} />
              </span>
              <h2>Ваша подборка</h2>
              <p>
                {cart.length} позиций · {units} единиц
              </p>
              <div className="recap-items">
                {cart.map((line) => (
                  <div key={line.productId}>
                    <span>
                      {products.find((p) => p.id === line.productId)?.name}
                      <small> × {line.quantity}</small>
                    </span>
                    <span>{rangeLabel(line.range)}</span>
                  </div>
                ))}
              </div>
            </div>
            <form
              id="contact-form"
              onSubmit={submitOrder}
              className={`contact-form ${highlightDemo ? "demo-filled" : ""}`}
            >
              <button
                type="button"
                className="demo-fill"
                onClick={demoContacts}
              >
                <Sparkles size={18} />
                <span>Заполнить демоданные</span>
                <ArrowRight size={17} />
              </button>
              <div className="name-fields">
                <label>
                  Имя
                  <input
                    autoComplete="given-name"
                    value={contact.firstName}
                    onChange={(e) =>
                      setContact({ ...contact, firstName: e.target.value })
                    }
                    required
                    maxLength={60}
                    placeholder="Александр"
                  />
                </label>
                <label>
                  Фамилия
                  <input
                    autoComplete="family-name"
                    value={contact.lastName}
                    onChange={(e) =>
                      setContact({ ...contact, lastName: e.target.value })
                    }
                    required
                    maxLength={60}
                    placeholder="Волков"
                  />
                </label>
              </div>
              <label>
                Электронная почта
                <input
                  type="email"
                  autoComplete="email"
                  value={contact.email}
                  onChange={(e) =>
                    setContact({ ...contact, email: e.target.value })
                  }
                  required
                  maxLength={160}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                Телефон
                <input
                  type="tel"
                  autoComplete="tel"
                  value={contact.phone}
                  onChange={(e) =>
                    setContact({ ...contact, phone: e.target.value })
                  }
                  required
                  maxLength={25}
                  placeholder="+998 90 123 45 67"
                />
              </label>
              <p className="subtle-note">
                Демонстрационный заказ. Оплата и отправка сообщений не
                выполняются.
              </p>
            </form>
          </div>
        )}
        {view === "success" && receipt && (
          <div className="success-stage">
            <div className="success-check">
              <Check size={42} strokeWidth={1.6} />
            </div>
            <p className="eyebrow">ВСЁ ГОТОВО</p>
            <h1 ref={heading} tabIndex={-1}>
              Заказ принят
            </h1>
            <p className="receipt-number">{receipt.number}</p>
            <p className="success-copy">
              Оборудование, даты и контакты сохранены.
            </p>
            <div className="success-details">
              <span>
                <strong>{receipt.items}</strong> единиц оборудования
              </span>
              <span>
                {contact.firstName} {contact.lastName}
              </span>
            </div>
            <button className="primary-button" onClick={finish}>
              На главную <ArrowRight size={18} />
            </button>
          </div>
        )}
        {view === "ops" && (
          <div className="ops-stage">
            <div className="ops-topline">
              <Tabs
                value={opsTab}
                onValueChange={(value) => {
                  setOpsTab(value as typeof opsTab);
                  setOpsPage(0);
                }}
              >
                <TabsList className="ops-tabs">
                  <TabsTrigger value="stock">Оборудование</TabsTrigger>
                  <TabsTrigger value="orders">
                    Заказы · {ops?.orders.length || 0}
                  </TabsTrigger>
                  <TabsTrigger value="purchases">
                    Закупки · {ops?.purchases.length || 0}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="operator-label">Режим оператора</span>
            </div>
            {busy && !ops ? (
              <div className="empty-panel">
                <LoaderCircle className="spin" /> Загрузка
              </div>
            ) : (
              ops && (
                <>
                  {opsTab === "stock" && (
                    <>
                      <div className="stock-summary">
                        <div>
                          <span>Парк</span>
                          <strong>
                            {ops.stock.reduce((sum, row) => sum + row.total, 0)}
                          </strong>
                        </div>
                        <div>
                          <span>На складе сейчас</span>
                          <strong>
                            {ops.stock.reduce(
                              (sum, row) => sum + row.inWarehouse,
                              0,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>В обороте сейчас</span>
                          <strong>
                            {ops.stock.reduce(
                              (sum, row) => sum + row.circulating,
                              0,
                            )}
                          </strong>
                        </div>
                      </div>
                      <Table className="ops-table">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Оборудование</TableHead>
                            <TableHead>Всего</TableHead>
                            <TableHead>На складе</TableHead>
                            <TableHead>В обороте</TableHead>
                            <TableHead>Освободится</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ops.stock
                            .slice(opsPage * 4, opsPage * 4 + 4)
                            .map((row) => (
                              <TableRow key={row.productId}>
                                <TableCell>
                                  {
                                    products.find((p) => p.id === row.productId)
                                      ?.name
                                  }
                                </TableCell>
                                <TableCell>{row.total}</TableCell>
                                <TableCell>{row.inWarehouse}</TableCell>
                                <TableCell>{row.circulating}</TableCell>
                                <TableCell>
                                  {row.firstFree
                                    ? shortDate(row.firstFree)
                                    : "Свободно"}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </>
                  )}
                  {opsTab === "orders" && (
                    <div className="operation-list">
                      {ops.orders.length ? (
                        ops.orders
                          .slice(opsPage * 4, opsPage * 4 + 4)
                          .map((order) => (
                            <div className="operation-row" key={order.number}>
                              <span className="operation-icon">
                                <ShoppingBag size={20} />
                              </span>
                              <div>
                                <strong>{order.number}</strong>
                                <span>{order.customer}</span>
                              </div>
                              <span>{order.lines} позиций</span>
                              <span className="status-pill">Принят</span>
                            </div>
                          ))
                      ) : (
                        <div className="empty-panel">
                          <ShoppingBag size={30} strokeWidth={1.2} />
                          <h2>Пока нет заказов</h2>
                          <p>Оформленные заказы появятся здесь.</p>
                        </div>
                      )}
                    </div>
                  )}
                  {opsTab === "purchases" && (
                    <div className="operation-list">
                      {ops.purchases.length ? (
                        ops.purchases
                          .slice(opsPage * 4, opsPage * 4 + 4)
                          .map((row) => (
                            <div
                              className="operation-row purchase-row"
                              key={row.id}
                            >
                              <span className="operation-icon">
                                <Package size={20} />
                              </span>
                              <div>
                                <strong>
                                  {
                                    products.find((p) => p.id === row.productId)
                                      ?.name
                                  }{" "}
                                  × {row.quantity}
                                </strong>
                                <span>
                                  {row.number} · нужно к{" "}
                                  {shortDate(row.neededBy)}
                                </span>
                              </div>
                              <span className="status-pill urgent">
                                Срочная закупка
                              </span>
                            </div>
                          ))
                      ) : (
                        <div className="empty-panel">
                          <CircleCheck size={30} strokeWidth={1.2} />
                          <h2>Закупки не требуются</h2>
                          <p>
                            Заявки создаются при нехватке оборудования на весь
                            срок.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {opsCount > 4 && (
                    <div className="ops-pagination">
                      <button
                        className="icon-button"
                        disabled={!opsPage}
                        onClick={() => setOpsPage((value) => value - 1)}
                        aria-label="Предыдущая страница"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span>
                        {opsPage + 1} / {Math.ceil(opsCount / 4)}
                      </span>
                      <button
                        className="icon-button"
                        disabled={(opsPage + 1) * 4 >= opsCount}
                        onClick={() => setOpsPage((value) => value + 1)}
                        aria-label="Следующая страница"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        )}
      </section>
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          {!ready && (
            <button onClick={() => void initialize()}>Повторить</button>
          )}
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Закрыть ошибку"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <footer className="app-footer">
        <span className="footer-note">
          {view === "categories" || view === "products"
            ? "Оборудование для вашей сцены"
            : view === "ops"
              ? "Изолированный демонстрационный сценарий"
              : view === "success"
                ? "StageOps / rental experience"
                : "Подборка сохранится при возвращении назад"}
        </span>
        {(view === "categories" || view === "products") && cart.length > 0 && (
          <div className="floating-cart">
            <button onClick={() => setCartOpen(true)} className="cart-summary">
              <ShoppingBag size={20} />
              <span>
                Подборка<strong>{units} ед.</strong>
              </span>
            </button>
            <button
              className="cart-next"
              onClick={openDates}
              aria-label="Перейти к выбору дат"
              title="Выбрать даты"
            >
              <ArrowRight size={22} />
            </button>
          </div>
        )}
        {view === "dates" && (
          <button
            className="primary-button"
            disabled={!allDated || pickingEnd}
            onClick={() => navigate("contact")}
          >
            Контакты <ArrowRight size={19} />
          </button>
        )}
        {view === "contact" && (
          <button
            type="submit"
            form="contact-form"
            className="primary-button"
            disabled={busy || !ready}
          >
            {busy ? (
              <>
                <LoaderCircle size={18} className="spin" /> Сохраняем
              </>
            ) : (
              <>
                Оформить заказ <ArrowRight size={19} />
              </>
            )}
          </button>
        )}
      </footer>
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="cart-sheet">
          <SheetHeader>
            <SheetTitle>Ваша подборка</SheetTitle>
            <SheetDescription>{units} единиц оборудования</SheetDescription>
          </SheetHeader>
          <div className="cart-lines">
            {cart.map((line) => {
              const product = products.find((p) => p.id === line.productId)!;
              return (
                <div className="cart-line" key={line.productId}>
                  <div className="small-product-icon">
                    <ProductIcon product={product} />
                  </div>
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.kind}</span>
                    <div className="stepper">
                      <button
                        onClick={() => updateQuantity(product.id, -1)}
                        aria-label={`Уменьшить ${product.name}`}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.id, 1)}
                        disabled={line.quantity >= 6}
                        aria-label={`Увеличить ${product.name}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => updateQuantity(product.id, -line.quantity)}
                    aria-label={`Удалить ${product.name}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
            {!cart.length && (
              <p className="subtle-note">Подборка пока пуста.</p>
            )}
          </div>
          <button
            className="primary-button"
            disabled={!cart.length}
            onClick={openDates}
          >
            Выбрать даты <ArrowRight size={18} />
          </button>
        </SheetContent>
      </Sheet>
    </main>
  );
}
