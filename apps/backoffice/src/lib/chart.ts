// Chart.js with only the pieces the dashboard draws (a line, bars, a doughnut), registered once.
// `chart.js/auto` registers every chart type and plugin: 22 KB more in the bundle (7 KB gzipped).
import { ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from "chart.js";

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip);

export { Chart };
