const GEOCODING_API_BASE = "https://geocoding-api.open-meteo.com/v1";
const FORECAST_API_BASE = "https://api.open-meteo.com/v1";
let recognition;
let isListening = false;

async function getWeather(cityInput) {
    const input = document.getElementById('cityInput');
    const query = cityInput || input.value.trim();

    if (!query) {
        alert("Please enter a location!");
        return;
    }

    try {
        const data = await fetchForecast(query);
        const cityName = `${data.location.name}, ${data.location.region || data.location.country}`;
        updateAdviceUI(data.current);
        displayResults(data, cityName);
        speakWeather(cityName, Math.round(data.current.temp_c), data.current.condition.text);
    } catch (err) {
        alert(err.message || "Unable to fetch weather right now.");
    }
}

async function fetchForecast(query) {
    const location = await geocodeLocation(query);
    const forecastData = await loadForecastData(location.latitude, location.longitude);
    return normalizeForecastData(location, forecastData);
}

async function fetchForecastByCoords(lat, lon) {
    const forecastData = await loadForecastData(lat, lon);
    const location = {
        name: "Your Location",
        region: "",
        country: ""
    };

    return normalizeForecastData(location, forecastData);
}

async function geocodeLocation(query) {
    const url = `${GEOCODING_API_BASE}/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || !data.results || !data.results.length) {
        throw new Error("Location not found.");
    }

    const best = data.results[0];
    return {
        name: best.name,
        region: best.admin1 || "",
        country: best.country || "",
        latitude: best.latitude,
        longitude: best.longitude
    };
}

async function loadForecastData(latitude, longitude) {
    const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,weather_code",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,relative_humidity_2m_mean,wind_speed_10m_max",
        timezone: "auto",
        forecast_days: "7"
    });

    const url = `${FORECAST_API_BASE}/forecast?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || !data.daily || !data.current) {
        throw new Error("Unable to fetch forecast right now.");
    }

    return data;
}

function normalizeForecastData(location, raw) {
    const days = raw.daily.time.map((date, index) => {
        const weatherInfo = mapWeatherCode(raw.daily.weather_code[index]);
        return {
            date,
            day: {
                condition: {
                    text: weatherInfo.text,
                    icon: weatherInfo.emoji
                },
                maxtemp_c: raw.daily.temperature_2m_max[index],
                mintemp_c: raw.daily.temperature_2m_min[index],
                avghumidity: raw.daily.relative_humidity_2m_mean[index],
                maxwind_kph: raw.daily.wind_speed_10m_max[index]
            },
            astro: {
                sunrise: to12HourTime(raw.daily.sunrise[index]),
                sunset: to12HourTime(raw.daily.sunset[index])
            }
        };
    });

    const currentWeather = mapWeatherCode(raw.current.weather_code);

    return {
        location,
        current: {
            temp_c: raw.current.temperature_2m,
            condition: {
                text: currentWeather.text
            }
        },
        forecast: {
            forecastday: days
        }
    };
}

function mapWeatherCode(code) {
    const weatherMap = {
        0: { text: "Clear sky", emoji: "☀️" },
        1: { text: "Mainly clear", emoji: "🌤️" },
        2: { text: "Partly cloudy", emoji: "⛅" },
        3: { text: "Overcast", emoji: "☁️" },
        45: { text: "Fog", emoji: "🌫️" },
        48: { text: "Depositing rime fog", emoji: "🌫️" },
        51: { text: "Light drizzle", emoji: "🌦️" },
        53: { text: "Moderate drizzle", emoji: "🌦️" },
        55: { text: "Dense drizzle", emoji: "🌧️" },
        56: { text: "Freezing drizzle", emoji: "🌧️" },
        57: { text: "Dense freezing drizzle", emoji: "🌧️" },
        61: { text: "Slight rain", emoji: "🌦️" },
        63: { text: "Moderate rain", emoji: "🌧️" },
        65: { text: "Heavy rain", emoji: "🌧️" },
        66: { text: "Freezing rain", emoji: "🌧️" },
        67: { text: "Heavy freezing rain", emoji: "🌧️" },
        71: { text: "Slight snow fall", emoji: "🌨️" },
        73: { text: "Moderate snow fall", emoji: "🌨️" },
        75: { text: "Heavy snow fall", emoji: "❄️" },
        77: { text: "Snow grains", emoji: "❄️" },
        80: { text: "Slight rain showers", emoji: "🌦️" },
        81: { text: "Moderate rain showers", emoji: "🌧️" },
        82: { text: "Violent rain showers", emoji: "⛈️" },
        85: { text: "Slight snow showers", emoji: "🌨️" },
        86: { text: "Heavy snow showers", emoji: "❄️" },
        95: { text: "Thunderstorm", emoji: "⛈️" },
        96: { text: "Thunderstorm with hail", emoji: "⛈️" },
        99: { text: "Heavy thunderstorm with hail", emoji: "⛈️" }
    };

    return weatherMap[code] || { text: "Unknown conditions", emoji: "🌍" };
}

function to12HourTime(isoDateTime) {
    const date = new Date(isoDateTime);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateAdviceUI(current) {
    const box = document.getElementById('adviceBox');
    const text = document.getElementById('adviceText');
    const temp = current.temp_c;
    const condition = current.condition.text.toLowerCase();

    // Keep existing mode classes (like dark-mode) and only swap weather backgrounds.
    document.body.classList.remove('bg-rainy', 'bg-sunny', 'bg-cloudy');
    let advice = "";

    if (condition.includes("rain") || condition.includes("drizzle") || condition.includes("storm")) {
        advice = "It's wet outside! Wear a waterproof jacket and carry an umbrella.";
        document.body.classList.add('bg-rainy');
    } else if (temp > 32) {
        advice = "Extreme heat! Wear light cotton clothes and stay hydrated.";
        document.body.classList.add('bg-sunny');
    } else if (temp < 18) {
        advice = "It's chilly! A sweater or light jacket would be perfect.";
        document.body.classList.add('bg-cloudy');
    } else {
        advice = "The weather is pleasant! Perfect for a walk in a light shirt.";
        document.body.classList.add('bg-sunny');
    }

    text.innerText = `Advice: ${advice}`;
    box.style.display = "block";
}

function displayResults(data, cityName) {
    const container = document.getElementById('forecastContainer');
    const days = data.forecast.forecastday;
    let html = `<h3 style="margin-top:20px;">7-Day Forecast: ${cityName}</h3><div class="forecast-grid">`;

    for (const day of days) {
        const dateParts = day.date.split("-");
        const dateLabel = `${dateParts[1]}/${dateParts[2]}`;
        const iconText = day.day.condition.icon;

        html += `
            <div class="card">
                <strong>${dateLabel}</strong>
                <div style="font-size:2rem; margin:10px 0;">${iconText}</div>
                <p><b>${day.day.condition.text}</b></p>
                <p>${Math.round(day.day.maxtemp_c)}° / ${Math.round(day.day.mintemp_c)}°C</p>
                <p style="font-size:0.75rem; margin-top:10px;">💧 ${day.day.avghumidity}% | 🌬️ ${Math.round(day.day.maxwind_kph)}kph</p>
                <p style="font-size:0.7rem; color: #666; margin-top:5px;">🌅 ${day.astro.sunrise} | 🌇 ${day.astro.sunset}</p>
            </div>`;
    }

    container.innerHTML = html + `</div>`;
}

function speakWeather(city, temp, desc) {
    window.speechSynthesis.cancel();
    const advice = document.getElementById('adviceText').innerText;
    const msg = new SpeechSynthesisUtterance(`In ${city}, it's ${desc} with ${temp} degrees Celsius. ${advice}`);
    window.speechSynthesis.speak(msg);
}

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
}

function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                getWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
            },
            () => {
                alert("Unable to access your location.");
            }
        );
    } else {
        alert("Geolocation is not supported by your browser.");
    }
}

async function getWeatherByCoords(lat, lon) {
    try {
        const data = await fetchForecastByCoords(lat, lon);
        const cityName = `${data.location.name}, ${data.location.region || data.location.country}`;
        displayResults(data, cityName);
        updateAdviceUI(data.current);
        speakWeather(cityName, Math.round(data.current.temp_c), data.current.condition.text);
    } catch (err) {
        alert(err.message || "Unable to fetch weather for your location.");
    }
}

function setupVoiceSearch() {
    const voiceButton = document.getElementById("voiceSearchBtn");
    const voiceStatus = document.getElementById("voiceStatus");
    const cityInput = document.getElementById("cityInput");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!voiceButton || !voiceStatus || !cityInput) {
        return;
    }

    if (!SpeechRecognition) {
        voiceButton.disabled = true;
        voiceStatus.innerText = "Voice search is not supported in this browser.";
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isListening = true;
        voiceButton.classList.add("listening");
        voiceStatus.innerText = "Listening...";
    };

    recognition.onresult = event => {
        const transcript = event.results[0][0].transcript.trim();
        cityInput.value = transcript;
        voiceStatus.innerText = `Heard: ${transcript}`;
        getWeather(transcript);
    };

    recognition.onerror = event => {
        if (event.error === "not-allowed") {
            voiceStatus.innerText = "Microphone permission was blocked.";
            return;
        }

        if (event.error === "no-speech") {
            voiceStatus.innerText = "No speech detected. Try again.";
            return;
        }

        voiceStatus.innerText = "Voice search failed. Please try again.";
    };

    recognition.onend = () => {
        isListening = false;
        voiceButton.classList.remove("listening");

        if (voiceStatus.innerText === "Listening...") {
            voiceStatus.innerText = "Tap the mic and say a city name.";
        }
    };

    voiceButton.addEventListener("click", () => {
        if (isListening) {
            recognition.stop();
            return;
        }

        voiceStatus.innerText = "Starting microphone...";
        recognition.start();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const cityInput = document.getElementById("cityInput");

    cityInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            getWeather();
        }
    });

    setupVoiceSearch();
});