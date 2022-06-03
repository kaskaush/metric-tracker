(function (w, d, n) {
    const analytics = w.__analytics,
        winPerformance = w.performance,
        ANALYTICS_SESSION_ID = 'AN',
        sessionStorage = w.sessionStorage,
        idleEvents = [
            'mousedown',
            'mousemove',
            'keypress',
            'scroll',
            'touchstart',
        ],
        PERFORMANCE_NAVIGATION_TIMING = winPerformance
            ? winPerformance.getEntriesByType('navigation')[0]
            : {},
        {
            pagePerformance = true,
            buttonClicks = true,
            linkClicks = true,
            pageViews = true,
            trackingId,
            metricsHost = undefined,
        } = analytics.config;

    let timer,
        timerStart,
        hidden,
        visibilityChange,
        globalPrevUrl,
        sessionStartTime,
        isSessionAlive = true,
        METRICS_ENDPOINT = '{METRICS_ENDPOINT}';

    if (metricsHost) {
        METRICS_ENDPOINT = metricsHost;
    }

    const Utils = {
        encodeUrl: function (url) {
            return encodeURIComponent(url);
        },
        getCurrentSessionData: function () {
            return {
                ...JSON.parse(sessionStorage.getItem(ANALYTICS_SESSION_ID)),
            };
        },
        setCurrentSessionData: function (data) {
            let currSessionData = this.getCurrentSessionData();
            currSessionData = { ...currSessionData, ...data };
            sessionStorage.setItem(
                ANALYTICS_SESSION_ID,
                JSON.stringify(currSessionData)
            );
        },
        getScrollPosition: function () {
            const supportPageOffset = w.pageXOffset !== undefined;
            const isCSS1Compat = (d.compatMode || '') === 'CSS1Compat';
            const scrollPos = { x: 0, y: 0 };

            if (supportPageOffset) {
                scrollPos.x =
                    typeof w.pageXOffset === 'function'
                        ? w.pageXOffset()
                        : w.pageXOffset;
                scrollPos.y =
                    typeof w.pageYOffset === 'function'
                        ? w.pageYOffset()
                        : w.pageYOffset;
            } else if (isCSS1Compat) {
                scrollPos.x = d.documentElement.scrollLeft;
                scrollPos.y = d.documentElement.scrollTop;
            } else {
                scrollPos.x = d.body.scrollLeft;
                scrollPos.y = d.body.scrollTop;
            }

            if (typeof scrollPos.x === 'number') {
                scrollPos.x = Math.round(scrollPos.x);
            }

            if (typeof scrollPos.y === 'number') {
                scrollPos.y = Math.round(scrollPos.y);
            }

            return scrollPos;
        },
        getRandomHash: function () {
            return Math.random().toString(36).substring(2, 9);
        },
        camelizeVar: function (input) {
            return input.replace(/-./g, (x) => x[1].toUpperCase());
        },
        getPaintData: function () {
            const paintData = {};
            if (winPerformance) {
                winPerformance
                    .getEntriesByType('paint')
                    .forEach((perfEntry) => {
                        paintData[this.camelizeVar(perfEntry.name)] =
                            Math.round(perfEntry.startTime);
                    });
            }
            return paintData;
        },
    };

    var timeSpentOnSite = getTimeSpentOnSite();
    function getTimeSpentOnSite() {
        const currSessionData = Utils.getCurrentSessionData();
        timeSpentOnSite = parseInt(currSessionData.timeSpentOnSite, 10);
        timeSpentOnSite = isNaN(timeSpentOnSite) ? 0 : timeSpentOnSite;
        return timeSpentOnSite;
    }

    function startTimer() {
        timerStart = Date.now();
        timer = setInterval(function () {
            const dateNow = Date.now();
            timeSpentOnSite = getTimeSpentOnSite() + (dateNow - timerStart);
            Utils.setCurrentSessionData({
                timeSpentOnSite,
            });
            timerStart = parseInt(dateNow, 10);
        }, 1000);
    }

    const stopCountingWhenWindowIsInactive = true;
    if (stopCountingWhenWindowIsInactive) {
        if (typeof d.hidden !== 'undefined') {
            hidden = 'hidden';
            visibilityChange = 'visibilitychange';
        } else if (typeof d.msHidden !== 'undefined') {
            hidden = 'msHidden';
            visibilityChange = 'msVisibilityChange';
        }

        let documentIsHidden = d[hidden];

        d.addEventListener(visibilityChange, function () {
            if (documentIsHidden !== d[hidden]) {
                if (d[hidden]) {
                    // window is inactive
                    clearInterval(timer);
                } else {
                    // window is active
                    startTimer();
                }
                documentIsHidden = d[hidden];
            }
        });
    }

    function initSession() {
        const currSessionData = Utils.getCurrentSessionData();
        if (currSessionData.sessionStartTime) {
            sessionStartTime = currSessionData.sessionStartTime;
        } else {
            sessionStartTime = Date.now();
            Utils.setCurrentSessionData({
                sessionId: `${ANALYTICS_SESSION_ID}_${Utils.getRandomHash()}`,
                sessionStartTime,
            });
        }
    }

    function ackAnalyticsScript(callback) {
        sendData(`${METRICS_ENDPOINT}/metric`, 'analytics init', {}, callback);
    }

    function decorateData(metricType, data = {}) {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const currSessionData = Utils.getCurrentSessionData();

        const {
            sessionId,
            supportData = {},
            location,
            userData = {},
        } = currSessionData;

        return {
            trackingId,
            metric: metricType,
            metricData: { ...data },
            userData,
            supportData,
            deviceData: {
                source: 'client',
                timeZone,
                createdAt: new Date().toISOString(),
                sessionId,
                cookiesEnabled: n.cookieEnabled,
                location,
                screenWidth: w.screen.width,
                screenHeight: w.screen.height,
            },
        };
    }

    function sendData(url, metricType, data, callback = undefined) {
        const decoratedData = decorateData(metricType, data);
        const stringifiedData = JSON.stringify(decoratedData);

        if (n && typeof n.sendBeacon === 'function') {
            const blob = new Blob([stringifiedData], {
                type: 'application/json',
            });
            n.sendBeacon(url, blob);
        } else if (typeof fetch === 'function') {
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                mode: 'cors',
                credentials: 'include',
                body: stringifiedData,
                keepalive: true,
            }).catch((error) => {
                console.error(error);
            });
        } else {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.withCredentials = true;
            xhr.send(stringifiedData);
        }

        if (typeof callback === 'function') {
            callback();
        }
    }

    function sendMetric(metricType = 'unknown', data) {
        sendData(`${METRICS_ENDPOINT}/metric`, metricType, data);
    }

    function calculatePagePerformance() {
        setTimeout(function () {
            if (winPerformance) {
                const perfData = winPerformance.timing;
                const totalPageLoadTime =
                    perfData.domContentLoadedEventEnd -
                    perfData.navigationStart;
                const pageRenderTime =
                    perfData.domComplete - perfData.domLoading;
                sendMetric('performance', {
                    totalPageLoadTime,
                    pageRenderTime,
                    ...Utils.getPaintData(),
                });
            }
        }, 0);
    }

    function trackPageView() {
        let prevUrl = '';
        const landingPage = d.URL;
        let pageTrackingObserver = new MutationObserver(function () {
            const pathname = d.URL;
            if (pathname !== prevUrl) {
                globalPrevUrl = prevUrl;
                prevUrl = pathname;
                if (isSessionAlive) {
                    sendMetric('page view', {
                        page: Utils.encodeUrl(pathname),
                        pageTitle: d.title,
                        landingPage: Utils.encodeUrl(landingPage),
                        referrer: Utils.encodeUrl(d.referrer),
                        previousPage: Utils.encodeUrl(globalPrevUrl),
                    });
                }
            }
        });
        pageTrackingObserver.observe(d, { subtree: true, childList: true });
    }

    function getUserLocation() {
        if (n && n.geolocation) {
            n.geolocation.getCurrentPosition(function (data) {
                Utils.setCurrentSessionData({
                    location: `${data.coords.latitude},${data.coords.longitude}`,
                });
            });
        }
    }

    function setSupportData(data) {
        const { supportData } = Utils.getCurrentSessionData();
        Utils.setCurrentSessionData({
            supportData: { ...supportData, ...data },
        });
    }

    function setUserData(data) {
        Utils.setCurrentSessionData({ userData: { ...data } });
    }

    function initTracking() {
        analytics.sendMetric = sendMetric;
        analytics.setSupportData = setSupportData;
        analytics.setUserData = setUserData;

        ackAnalyticsScript(function () {
            initSession();
            if (pageViews) {
                trackPageView();
            }
        });
    }

    function sendSessionClosed(type = 'session closed') {
        const sessionEndTime = Date.now();
        sendMetric(type, { timeSpent: sessionEndTime - sessionStartTime });
    }

    function trackIdleTimeout() {
        let time;

        function timedOut() {
            sendSessionClosed('session timeout');
            isSessionAlive = false;
        }

        function resetTimer() {
            clearTimeout(time);
            time = setTimeout(timedOut, 30 * 60 * 1000);
            isSessionAlive = true;
        }

        idleEvents.forEach(function (event) {
            w.addEventListener(event, resetTimer, true);
        });
    }

    function listenClicks(event) {
        const clickedElement = event.target;
        const page = Utils.encodeUrl(globalPrevUrl);
        if (clickedElement.tagName === 'A' && linkClicks) {
            sendMetric('link click', {
                linkText: `${clickedElement.innerText || ''}`,
                href: Utils.encodeUrl(clickedElement.href) || '',
                page,
            });
        }

        if (clickedElement.tagName === 'BUTTON' && buttonClicks) {
            sendMetric('button click', {
                buttonText: `${clickedElement.innerText || ''}`,
                page,
            });
        }
    }

    w.addEventListener('DOMContentLoaded', function () {
        initTracking();
        trackIdleTimeout();
        getUserLocation();
        startTimer();
    });

    d.onclick = function (e) {
        if (isSessionAlive) {
            listenClicks(e);
        }
    };

    w.onload = function () {
        if (isSessionAlive && pagePerformance) {
            calculatePagePerformance();
        }
    };

    w.onunload = function () {
        if (PERFORMANCE_NAVIGATION_TIMING.type !== 'reload') {
            const { x, y } = Utils.getScrollPosition();
            sendMetric('page close', {
                lastPage: Utils.encodeUrl(d.URL),
                lastScrollPositionX: x,
                lastScrollPositionY: y,
                timeSpent: timeSpentOnSite,
            });
        }
    };
})(window, document, navigator);
