let chartData = [];
let chart;
let allTargets = [];
let allZones = [];

const ctx = document.getElementById("errorChart").getContext("2d");
const errorMessage = document.getElementById("errorMessage");
const loader = document.getElementById("loader");

// Установка локали Moment.js на русский
moment.locale("ru");

// Проверка наличия Moment.js
if (typeof moment === "undefined") {
  console.error(
    "Moment.js не загружен. Проверьте подключение скрипта moment.min.js."
  );
  errorMessage.textContent =
    "Ошибка: Moment.js не загружен. Проверьте интернет-соединение или скрипты в index.html.";
}

// Проверка наличия Chart.js
if (typeof Chart === "undefined") {
  console.error(
    "Chart.js не загружен. Проверьте подключение скрипта chart.umd.min.js."
  );
  errorMessage.textContent =
    "Ошибка: Chart.js не загружен. Проверьте интернет-соединение или скрипты в index.html.";
}

function showLoader() {
  if (loader) loader.style.display = "flex";
}

function hideLoader() {
  if (loader) loader.style.display = "none";
}

function extractZone(target) {
  const host = target.split("/")[0];
  const parts = host.split(".");
  return parts.length > 1 ? "." + parts[parts.length - 1].toLowerCase() : "";
}

// Получение значений диапазона дат из инпутов
function getDateRange() {
  const startInput = document.getElementById("startDate");
  const endInput = document.getElementById("endDate");

  const startValue =
    startInput && startInput.value
      ? moment(startInput.value, "YYYY-MM-DD").startOf("day")
      : null;
  const endValue =
    endInput && endInput.value
      ? moment(endInput.value, "YYYY-MM-DD").endOf("day")
      : null;

  return { startValue, endValue };
}

/**
 * Универсальный обработчик любого изменения параметров.
 * Если нужно перезагрузить JSON (смена main/clone) — ставим флаг reloadData = true.
 */
function onParamsChange(reloadData = false) {
  if (reloadData) {
    // смена main/clone — нужно перезагрузить JSON
    loadData();
  } else {
    // просто перерисовать график по уже загруженным данным
    updateChart();
  }
}

function loadData() {
  showLoader(); // ← включаем лоадер строго тут
  const dataType = document.getElementById("dataType").value;
  const jsonFile =
    dataType === "main" ? "log_results.json" : "log_results_clone.json";

  fetch(jsonFile)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log(`JSON успешно загружен для ${dataType}:`, data);
      chartData = data;

      // Получаем все уникальные target
      allTargets = [...new Set(data.map((item) => item.target))];
      allTargets.sort();

      // Получаем все уникальные зоны
      allZones = [...new Set(data.map((item) => extractZone(item.target)))];
      allZones.sort();

      updateTargetSelect();
      updateZoneSelect();

      // Автоопределение min/max дат по данным
      if (chartData.length > 0) {
        const timestamps = chartData
          .map((e) => moment(e.timestamp, moment.ISO_8601))
          .filter((m) => m.isValid())
          .sort((a, b) => a - b);

        if (timestamps.length > 0) {
          const minDate = timestamps[0].format("YYYY-MM-DD");
          const maxDate =
            timestamps[timestamps.length - 1].format("YYYY-MM-DD");

          const startInput = document.getElementById("startDate");
          const endInput = document.getElementById("endDate");

          if (startInput && !startInput.value) startInput.value = minDate;
          if (endInput && !endInput.value) endInput.value = maxDate;
        }
      }

      // после загрузки данных перерисуем график (он сам покажет/спрячет лоадер)
      updateChart();
    })
    .catch((error) => {
      console.error(`Ошибка загрузки JSON для ${dataType}:`, error);
      errorMessage.textContent = `Ошибка загрузки данных для ${
        dataType === "main" ? "основных доменов" : "остальных доменов"
      }. Проверьте файл ${jsonFile} или запустите через локальный сервер (например, python -m http.server).`;
      hideLoader();
    });
}

function updateTargetSelect() {
  const targetSelect = document.getElementById("targetSelect");
  targetSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Все домены";
  targetSelect.appendChild(allOption);

  allTargets.forEach((target) => {
    const option = document.createElement("option");
    option.value = target;
    option.textContent = target;
    targetSelect.appendChild(option);
  });
}

function updateZoneSelect() {
  const zoneSelect = document.getElementById("zoneSelect");
  zoneSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Все зоны";
  zoneSelect.appendChild(allOption);

  allZones.forEach((zone) => {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = zone;
    zoneSelect.appendChild(option);
  });
}

function getGroupedDate(date, groupBy) {
  switch (groupBy) {
    case "week":
      return date.format("YYYY-WW");
    case "day":
      return date.format("YYYY-MM-DD");
    case "month":
    default:
      return date.format("YYYY-MM");
  }
}

function getGroupLabel(groupBy, dateStr) {
  let date;
  switch (groupBy) {
    case "month":
      date = moment(dateStr, "YYYY-MM");
      return date.format("MMMM YYYY");
    case "week":
      const [year, week] = dateStr.split("-");
      date = moment().year(year).week(week).startOf("week");
      const endDate = date.clone().endOf("week");
      return `${date.format("D")}-${endDate.format("D.MM.YY")}`;
    case "day":
    default:
      date = moment(dateStr, "YYYY-MM-DD");
      return date.format("DD.MM.YY");
  }
}

function aggregateData(errorType, groupBy = "month", selectedTarget = "all") {
  const selectedZone = document.getElementById("zoneSelect").value;

  if (!moment) {
    console.error("Moment.js не доступен в aggregateData.");
    errorMessage.textContent = "Ошибка: Moment.js не доступен.";
    return { labels: [], datasets: [] };
  }

  const { startValue, endValue } = getDateRange();

  const filteredData = chartData.filter((entry) => {
    const byTarget =
      selectedTarget === "all" || entry.target === selectedTarget;
    const byZone =
      selectedZone === "all" || extractZone(entry.target) === selectedZone;

    const date = moment(entry.timestamp, moment.ISO_8601);
    if (!date.isValid()) return false;

    const byStart = startValue ? date.isSameOrAfter(startValue) : true;
    const byEnd = endValue ? date.isSameOrBefore(endValue) : true;

    return byTarget && byZone && byStart && byEnd;
  });

  if (errorType === "all") {
    const errorTypes = ["медленный ответ", "не дождался ответа", "недоступен"];
    const groupedCounts = {};
    const labelsSet = new Set();

    errorTypes.forEach((type) => {
      groupedCounts[type] = {};
    });

    filteredData.forEach((entry) => {
      try {
        const date = moment(entry.timestamp, moment.ISO_8601);
        if (!date.isValid()) {
          console.warn(`Некорректный формат timestamp: ${entry.timestamp}`);
          return;
        }
        const groupKey = getGroupedDate(date, groupBy);
        labelsSet.add(groupKey);
        if (errorTypes.includes(entry.status)) {
          groupedCounts[entry.status][groupKey] =
            (groupedCounts[entry.status][groupKey] || 0) + 1;
        }
      } catch (e) {
        console.warn(`Ошибка обработки записи: ${JSON.stringify(entry)}`, e);
      }
    });

    const labels = Array.from(labelsSet).sort();
    const datasets = errorTypes.map((type) => ({
      label: type,
      data: labels.map((label) => groupedCounts[type][label] || 0),
      backgroundColor:
        type === "медленный ответ"
          ? "rgba(255, 206, 86, 0.6)"
          : type === "не дождался ответа"
          ? "rgba(255, 99, 132, 0.6)"
          : "rgba(54, 162, 235, 0.6)",
      borderColor:
        type === "медленный ответ"
          ? "rgba(255, 206, 86, 1)"
          : type === "не дождался ответа"
          ? "rgba(255, 99, 132, 1)"
          : "rgba(54, 162, 235, 1)",
      borderWidth: 1,
    }));

    if (labels.length === 0) {
      console.warn("Нет данных для отображения ошибок.");
      errorMessage.textContent =
        "Нет данных для отображения. Проверьте соответствующий JSON файл или диапазон дат.";
    } else {
      errorMessage.textContent = "";
    }

    return {
      labels: labels.map((label) => getGroupLabel(groupBy, label)),
      datasets,
    };
  } else {
    const groupedCounts = {};

    filteredData.forEach((entry) => {
      if (entry.status === errorType) {
        try {
          const date = moment(entry.timestamp, moment.ISO_8601);
          if (!date.isValid()) {
            console.warn(`Некорректный формат timestamp: ${entry.timestamp}`);
            return;
          }
          const groupKey = getGroupedDate(date, groupBy);
          groupedCounts[groupKey] = (groupedCounts[groupKey] || 0) + 1;
        } catch (e) {
          console.warn(`Ошибка обработки записи: ${JSON.stringify(entry)}`, e);
        }
      }
    });

    const labels = Object.keys(groupedCounts).sort();
    const data = labels.map((label) => groupedCounts[label]);

    if (labels.length === 0) {
      console.warn(`Нет данных для типа ошибки: ${errorType}`);
      errorMessage.textContent = `Нет данных для "${errorType}". Проверьте диапазон дат или попробуйте другой тип ошибки.`;
    } else {
      errorMessage.textContent = "";
    }

    return {
      labels: labels.map((label) => getGroupLabel(groupBy, label)),
      datasets: [
        {
          label:
            selectedTarget === "all"
              ? errorType
              : `${errorType} (${selectedTarget})`,
          data: data,
          backgroundColor:
            errorType === "медленный ответ"
              ? "rgba(255, 206, 86, 0.6)"
              : errorType === "не дождался ответа"
              ? "rgba(255, 99, 132, 0.6)"
              : "rgba(54, 162, 235, 0.6)",
          borderColor:
            errorType === "медленный ответ"
              ? "rgba(255, 206, 86, 1)"
              : errorType === "не дождался ответа"
              ? "rgba(255, 99, 132, 1)"
              : "rgba(54, 162, 235, 1)",
          borderWidth: 1,
        },
      ],
    };
  }
}

function updateChart() {
  // включаем лоадер поверх графика
  showLoader();

  // даём браузеру возможность отрисовать лоадер и новые значения инпутов/селектов
  setTimeout(() => {
    const errorType = document.getElementById("errorType").value;
    const groupBy = document.getElementById("groupBy").value;
    const selectedTarget = document.getElementById("targetSelect").value;
    const selectedZone = document.getElementById("zoneSelect").value;

    console.log(
      `Обновление графика: ошибка=${errorType}, группировка=${groupBy}, target=${selectedTarget}, зона=${selectedZone}`
    );

    const { labels, datasets } = aggregateData(
      errorType,
      groupBy,
      selectedTarget
    );

    if (chart) {
      chart.destroy();
    }

    const canvas = document.getElementById("errorChart");
    canvas.removeAttribute("width");
    canvas.removeAttribute("height");
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    let titleText;
    if (errorType === "all") {
      titleText = `Количество всех ошибок ${
        selectedTarget === "all" ? "" : `для ${selectedTarget}`
      }`;
    } else {
      titleText = `Количество ошибок "${errorType}" ${
        selectedTarget === "all" ? "" : `для ${selectedTarget}`
      }`;
    }

    if (selectedZone !== "all") {
      titleText += ` (зона ${selectedZone})`;
    }

    titleText += ` ${
      groupBy === "month"
        ? "по месяцам"
        : groupBy === "week"
        ? "по неделям"
        : "по дням"
    }`;

    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: datasets,
      },
      options: {
        indexAxis: "x",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text:
                groupBy === "month"
                  ? "Месяц"
                  : groupBy === "week"
                  ? "Неделя"
                  : "День",
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Количество ошибок",
            },
          },
        },
        plugins: {
          legend: {
            position: "bottom",
          },
          title: {
            display: true,
            text: titleText,
          },
        },
      },
    });

    // немного задержим скрытие, чтобы точно успело перерисоваться
    setTimeout(hideLoader, 0);
  }, 0);
}

// Начальная загрузка данных (с лоадером)
showLoader();
loadData();
