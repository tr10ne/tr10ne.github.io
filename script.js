let chartData = [];
let chart;
let allTargets = []; // Массив для хранения всех уникальных target

const ctx = document.getElementById("errorChart").getContext("2d");
const errorMessage = document.getElementById("errorMessage");

// Проверка наличия Moment.js
if (typeof moment === "undefined") {
  console.error(
    "Moment.js не загружен. Проверьте подключение скрипта moment.min.js."
  );
  errorMessage.textContent =
    "Ошибка: Moment.js не загружен. Проверьте интернет-соединение или скрипты в index.html.";
}

// Загрузка JSON данных
fetch("log_results.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then((data) => {
    console.log("JSON успешно загружен:", data);
    chartData = data;

    // Получаем все уникальные target из данных
    allTargets = [...new Set(data.map((item) => item.target))];
    allTargets.sort();

    // Обновляем select с target
    updateTargetSelect();
    updateChart();
  })
  .catch((error) => {
    console.error("Ошибка загрузки JSON:", error);
    errorMessage.textContent =
      "Ошибка загрузки данных. Проверьте файл log_results.json или запустите через локальный сервер (например, python -m http.server).";
  });

function updateTargetSelect() {
  const targetSelect = document.getElementById("targetSelect");
  targetSelect.innerHTML = ""; // Очищаем select

  // Добавляем опцию "Все домены"
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Все домены";
  targetSelect.appendChild(allOption);

  // Добавляем все target
  allTargets.forEach((target) => {
    const option = document.createElement("option");
    option.value = target;
    option.textContent = target;
    targetSelect.appendChild(option);
  });
}

function getGroupedDate(date, groupBy) {
  switch (groupBy) {
    case "week":
      return date.format("YYYY-[W]WW");
    case "day":
      return date.format("YYYY-MM-DD");
    case "month":
    default:
      return date.format("YYYY-MM");
  }
}

function getGroupLabel(groupBy, dateStr) {
  switch (groupBy) {
    case "week":
      return `Неделя ${dateStr.split("W")[1]}, ${dateStr.split("W")[0]}`;
    case "day":
      return dateStr;
    case "month":
    default:
      return dateStr;
  }
}

function aggregateData(errorType, groupBy = "month", selectedTarget = "all") {
  if (!moment) {
    console.error("Moment.js не доступен в aggregateData.");
    errorMessage.textContent = "Ошибка: Moment.js не доступен.";
    return { labels: [], datasets: [] };
  }

  // Фильтруем данные по выбранному target
  const filteredData =
    selectedTarget === "all"
      ? chartData
      : chartData.filter((entry) => entry.target === selectedTarget);

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
        "Нет данных для отображения. Проверьте log_results.json.";
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
      errorMessage.textContent = `Нет данных для "${errorType}". Попробуйте другой тип ошибки.`;
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
  const errorType = document.getElementById("errorType").value;
  const groupBy = document.getElementById("groupBy").value;
  const selectedTarget = document.getElementById("targetSelect").value;

  console.log(
    `Обновление графика для типа ошибки: ${errorType}, группировка: ${groupBy}, target: ${selectedTarget}`
  );
  const { labels, datasets } = aggregateData(
    errorType,
    groupBy,
    selectedTarget
  );

  if (chart) {
    chart.destroy();
  }

  // Удаление inline-стилей, чтобы canvas корректно масштабировался по CSS
  const canvas = document.getElementById("errorChart");
  canvas.removeAttribute("width");
  canvas.removeAttribute("height");
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  let titleText;
  if (errorType === "all") {
    titleText = `Количество всех ошибок ${
      selectedTarget === "all" ? "" : `для ${selectedTarget}`
    } ${
      groupBy === "month"
        ? "по месяцам"
        : groupBy === "week"
        ? "по неделям"
        : "по дням"
    }`;
  } else {
    titleText = `Количество ошибок "${errorType}" ${
      selectedTarget === "all" ? "" : `для ${selectedTarget}`
    } ${
      groupBy === "month"
        ? "по месяцам"
        : groupBy === "week"
        ? "по неделям"
        : "по дням"
    }`;
  }

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: datasets,
    },
    options: {
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
          position: "top",
        },
        title: {
          display: true,
          text: titleText,
        },
      },
    },
  });
}
