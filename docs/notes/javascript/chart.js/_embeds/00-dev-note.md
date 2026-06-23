

## 개발노트 ─ 테마 전환 메뉴얼 (Line Charts && Vue 2) {#dev-note-line-vue2}

1. themeMixinx JS 스크립트 불러오기
2. new VueApp에 `mixins: [themeMixin],` 선언
3. watch: 블록에 theme 감지기 추가
4. Chart Instance 설정 변수들을 created() 블록에 추가
  - chartMetas 항목:
    + line) key, ref, conf, series
      + key는 마음대로, ref는 해당 Chart의 canvas Element를 확인한다.
      + conf에 들어갈 요소는 createChart() 함수의 마지막 new Chart 생성자 참고
      + seriese에 들어갈 요소는 watch: rrdList 함수의 datasets 매핑 코드를 확인한다.
5. method: 블록 안에 선언된 beforeDestroy() 코드를 바깥으로 꺼낸다.
  - 다음 세 라인을 추가:
    + pollingTimer 초기화하는 clearTimeout
    + Chart Instance를 제거하는 destroy()
    + Chart Instance 관리하는 this.charts 빈 객체로 초기화
6. Chart의 datasets 매핑 로직 수정
  - methods: updateChart() 함수 추가
    + rrdList에서 하드코딩된 수작업을 forEach로 개선
      + Chart 추가/수정 시 chartMetas만 건드리면 됨.
    + this.charts를 순회해서 chartMetas 정보의 series로 순차 인덱싱
  - watch: rrdList() 함수 수정
    + 하드코딩 영역을 updateChart() 함수로 대체
7. Chart instance 테마별 색상 로직 추가
  - methods: resolveLineColor() 함수 추가
  - methods: createChart().getConfig 수정
    + borderColor, backgroundColor를 resolveLineColor 클로저로 변경
    + 테마에 따른 grid, text 변경을 위해 uiText, uiGrid 변수 추가 후 return값에 추가
    + 기존의 new Chart 코드를 수정:
      + chartMetas를 순회하여, Chart Instance 생성과 동시에 vm.charts 객체에 저장하도록.

**created() 선언:**

```javascript
  created() {
		this.charts = {};
		this.pollingTimer = null;
		this.chartMetas = [
		  { key: 'cpu', ref: 'cpuChart'
			, conf: { data: ['CPU', 'IO 지연율'], yTitle: '%', formatType: {type:'%', unit:100} }
			, series: [vo => vo.cpu, vo => vo.iowait] },
		  { key: 'server', ref: 'serverChart'
		    , conf: { data: ['서버 부하 평균'], yTitle: '서버 부하 평균', formatType: {type:'/'} }
		    , series: [vo => vo.loadavg] },
		  { key: 'mem', ref: 'memChart'
		    , conf: { data: ['전체', '사용량', 'ZFS', '사용 가능'], yTitle: 'Bytes', formatType: {type: 'byte'} }
		    , series: [vo => vo.memtotal, vo => vo.memused, vo => vo.arcsize, vo => vo.memavailable] },
		  { key: 'networkTraffic', ref: 'networkTrafficChart'
		    , conf: { data: ['수신', '발신'], yTitle: '', formatType: {type: 'byte'} }
		    , series: [vo => vo.netin, vo => vo.netout] },
		  { key: 'cpuPressureStall', ref: 'cpuPressureStallChart'
		    , conf: { data: ['부분 지연'], yTitle: '%', formatType: {type:'%'}, colorSet:'pressureStall' }
		    , series: [vo => vo.pressurecpusome] },
		  { key: 'IOPressureStall', ref: 'IOPressureStallChart'
		    , conf: { data: ['부분 지연', '전체 지연'], yTitle: '%', formatType: {type:'%'}, colorSet:'pressureStall' }
		    , series: [vo => vo.pressureiosome, vo => vo.pressureiofull] },
		  { key: 'memoryPressureStall', ref: 'memoryPressureStallChart'
		    , conf: { data: ['부분 지연', '전체 지연'], yTitle: '%', formatType: {type:'%'}, colorSet:'pressureStall' }
		    , series: [vo => vo.pressurememorysome, vo => vo.pressurememoryfull] },
		];
		this.lineTheme = {
		  A: { line: { default: [ [46,204,113],[52,152,219],[36,173,154],[187,222,13] ], pressureStall: [ [255,209,62],[166,17,32] ] },
				 ui: { text: 'rgb(33, 37, 41)',  grid: 'rgba(0, 0, 0, 0.1)' } },
		  B: { line: { default: [ [242,183,98],[35,176,255],[220,166,239],[140,214,16] ], pressureStall: [ [255,209,62],[166,17,32] ] },
				 ui: { text: 'rgb(33, 37, 41)',  grid: 'rgba(0, 0, 0, 0.1)' } },
		  C: { line: { default: [ [120,120,120],[80,80,80],[160,160,160],[200,200,200] ], pressureStall: [ [255,209,62],[166,17,32] ] },
				 ui: { text: 'rgb(33, 37, 41)',  grid: 'rgba(0, 0, 0, 0.1)' } },
		  D: { line: { default: [ [93,178,243],[110,200,255],[60,140,210],[180,220,255] ], pressureStall: [ [238,0,0],[255,140,0] ] },
				 ui: { text: 'rgb(242, 242, 242)', grid: 'rgba(255, 255, 255, 0.15)' } },
		};
  },

```

**beforeDestroy() 선언:**

```javascript
  beforeDestroy() {
    clearTimeout(this.pollingTimer);
    //if (this.resizeObserver) {
    //  this.resizeObserver.disconnect();
    //}
    /*this.resizeObserver?.disconnect();*/
    Object.values(this.charts).forEach(c => c?.destroy());
    this.charts = {};
  },
```

**methods 함수 선언:**

```javascript

  /* resolveLineColor(): */
  resolveLineColor(colorSet, idx) {
    return this.lineTheme[this.theme].line[colorSet ?? 'default'][idx];
  },


  /* updateCharts(): */
  updateCharts(rrd) {
    //rrd(통계*배열)을 받아서 7개 차트 갱신
    const labels = rrd.map(vo => dateFormat(new Date(vo.time * 1000), 'YYYY-MM-DD HH:mm:ss'));
    
    this.chartMetas.forEach(m => {
    const chart = this.charts[m.key];
    if(!chart) return;
    
    chart.data.labels = labels;
    
    m.series.forEach((extract, i) => {
      chart.data.datasets[i].data = rrd.map(extract);
    });
    chart.update();
    });
  },
```

**Chart.js 인스턴스의 설정값 선언:**

```javascript
  createChart() {
    const getConfig = (conf) => {
    const datasets = conf.data.map( title => ({
      label: title,
      data: null,
      borderColor: ctx => `rgba(${vm.resolveLineColor(conf.colorSet, ctx.datasetIndex).join(', ')}, 1)`,
      backgroundColor: ctx => `rgba(${vm.resolveLineColor(conf.colorSet, ctx.datasetIndex).join(', ')}, 0.2)`,
      fill: true,
      tension: 0,
      pointRadius: 0,
      pointHoverRadius: 6
    }));
    
    const uiText = () => vm.lineTheme[vm.theme].ui.text;
    const uiGrid = () => vm.lineTheme[vm.theme].ui.grid;

    return {
      type: 'line',
      data: {
        labels: null,
        datasets: datasets
      },
      options: {
				animation: false,
				responsive: true,
				maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
					  labels: {
					    color: uiText,
					    usePointStyle: true,
					    pointStyle: 'rect'
					  },
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let value = context.raw;
                let result = context.dataset.label + ': ';
                if(conf.formatType.type == '%') {
                  value = ((value * (conf.formatType.unit ?? 1)).toFixed(2)) + '%';
                } else if(conf.formatType.type == 'byte') {
                  value = formatBytes(value);
                } else if(conf.formatType.type == '/') {
                  value = ((value / (conf.formatType.unit ?? 1)).toFixed(2));
                }
                return result + value;
              }
            }
          },
        },
        interaction: {
          mode: 'nearest',   // 마우스 근처 데이터 선택
          intersect: false   // 점과 정확히 겹치지 않아도 활성화
        },
        scales: {
          x: {
            ticks: {
					    color: uiText,
              maxRotation: 0, // 기울기 최대값 0
              minRotation: 0, // 기울기 최소값 0
              maxTicksLimit: 8, // 표시할 최대 레이블 수
              callback: function(value, index) {
                  const label = this.getLabelForValue(value);
                  // 날짜/시간 기준으로 줄바꿈
                  return label.split(' '); // 배열로 반환하면 자동 줄바꿈
              },
            },
					  grid: {color: uiGrid},
          },
          y: {
            beginAtZero: true,
            title: {
              color: uiText,
              display: true,
              text: conf.yTitle,
            },
            ticks: {
					    color: uiText,
                callback: function (value) {
                  if(conf.formatType.type == '%') {
                      return (value * (conf.formatType.unit ?? 1)).toFixed(2);
                  } else if(conf.formatType.type == 'byte') {
                    return formatBytes(value);
                  } else if(conf.formatType.type == '/') {
                      return (value / (conf.formatType.unit ?? 1)).toFixed(2);
                  } else {
                    return value;
                  }
                },
              }
            },
          }
        }
      }
    };
		  
    vm.chartMetas.forEach(m => {
    vm.charts[m.key] = new Chart(vm.$refs[m.ref], getConfig(m.conf));
  }}
```

## 개발노트 ─ 테마 전환 메뉴얼 (Gauge Charts && Vue 2) {#dev-note-gauge-vue2}

1. themeMixin JS 스크립트 불러오기
  - 게이지는 가운데 사용률 텍스트를 doughnutLabel로 그리므로,
    chartjs-plugin-annotation 도 함께 로드한다. (라인엔 없던 의존성)
2. new VueApp에 `mixins: [themeMixin],` 선언
3. watch: 블록에 theme 감지기 추가
  - Object.values(this.charts).forEach(c => c?.update())
4. Chart Instance 설정 변수들을 created() 블록에 추가
  - chartMetas 항목:
    + gauge) key, ref, title, perc
      + key는 마음대로, ref는 해당 Gauge의 canvas Element를 확인한다.
      + title은 게이지 라벨(CPU/메모리/스토리지).
        라인은 conf를 메타에 직접 넣었지만, 게이지는 conf를 넣지 않는다.
        createChart()의 getConfig(title)에 이 title을 넘겨 conf를 동적 생성하고,
        resolveGaugeColor의 B 테마 리소스별 색 분기에도 쓴다.
      + perc는 사용률(%)을 뽑는 함수 (r => ..., r은 vm.resource).
        라인의 series(datasets 매핑)와 다르다. 게이지는 단일 값이라
        datasets를 매핑하는 게 아니라, [v, 100-v] 두 조각을 만들 첫 값만 추출한다.
  - this.charts = {} 와 this.pollingTimer = null 도 같은 블록에 둔다.
5. method: 블록 안에 선언된 beforeDestroy() 코드를 바깥으로 꺼낸다.
  - 다음 세 라인을 추가:
    + pollingTimer 초기화하는 clearTimeout
    + Chart Instance를 제거하는 destroy()
    + Chart Instance 관리하는 this.charts 빈 객체로 초기화
6. Gauge의 data 매핑 로직 수정
  - methods: updateCharts() 함수 추가
    + getData 안에 하드코딩돼 있던 게이지별 갱신(cpu/mem/storageGaugeChart 각각
      data 계산 후 update)을 forEach로 개선
      + Gauge 추가/수정 시 chartMetas만 건드리면 됨.
    + this.charts를 순회하여 chartMetas의 perc(r)로 사용률 추출 →
      data = [v, Math.max(0, 100 - v)] 로 갱신 (perc가 null이면 [0, 100])
  - getData() 함수 수정
    + 하드코딩된 갱신 영역을 updateCharts() 호출로 대체
    + 라인은 watch: rrdList()를 고쳤지만, 게이지는 데이터가 폴링 콜백으로
      들어오므로 watch가 아니라 getData() 콜백 안에서 호출한다.
7. Gauge instance 테마별 색상 로직 추가
  - methods: resolveGaugeColor() 함수 추가
    + 라인의 resolveLineColor와 달리, 색 팔레트(PALETTE_A~D)를 함수가 들고 있다.
    + role 4종으로 분기한다:
      + BACKGROUND      값 조각 — perc로 임계(USAGE_LEVEL.WARNING/DANGER) 인덱스를 골라 색 결정
      + BACKGROUND_LEFT 트랙(나머지) 조각
      + LABEL           가운데 텍스트(라벨)
      + PERC            가운데 % 숫자 강조색
    + title은 B 테마에서 리소스별(CPU/메모리/스토리지) 색을 가르는 데 쓴다.
  - methods: createChart()의 getConfig 작성
    + initData(title): datasets[0].backgroundColor를 resolveGaugeColor 클로저로 준다.
      ctx.index === 1(트랙)이면 BACKGROUND_LEFT, 아니면 BACKGROUND(값, 임계색).
      그리고 borderWidth: 0 으로 조각 테두리를 제거한다.
    + 라인은 축이 있어 grid/text용 uiGrid/uiText를 return에 추가했지만,
      게이지는 축이 없다. 대신 가운데 사용률 텍스트(annotation doughnutLabel)의
      color를 resolveGaugeColor('LABEL'), resolveGaugeColor('PERC') 클로저로 바꿔
      테마에 반응시킨다. ← 라인의 uiGrid/uiText에 대응하는 자리
    + getConfig(title): type 'doughnut', circumference 180, rotation -90,
      plugins.annotation.annotations 에 doughnutLabel(getAnnotation) 등록.
    + 기존 new Chart 코드를 수정: chartMetas를 순회하여 Gauge Instance 생성과 동시에
      vm.charts 객체에 저장하도록 → new Chart(vm.$refs[g.ref], getConfig(g.title))

**created() 선언:**

```javascript
  created() {
    this.charts = {};           //차트 인스턴스는 반응형으로 감싸지 않는다. RangeError.
    this.pollingTimer = null;   //beforeDestroy에서 사용할 id 필요
    this.chartMetas = [             //Chart마다 반복해서 로직을 처리하던 걸, 배열에 묶어두어 코드를 단순화 (r은 vm.resource)
      {key: 'cpu',     ref: 'cpuGauge',     title: 'CPU',      perc: r => (r.cpu != null ? r.cpu * 100 : null) },
      {key: 'mem',     ref: 'memGauge',     title: '메모리',   perc: r => (r.maxmem ? r.mem / r.maxmem * 100 : null) },
      {key: 'storage', ref: 'storageGauge', title: '스토리지', perc: r => (r.maxdisk ? r.disk / r.maxdisk * 100 : null) },
    ];
    this.gaugeTheme = {
      A: {
      background: { default: ['rgb(0, 128, 254)', 'rgb(239, 198, 0)', 'rgb(231, 24, 49)', 'rgb(234, 234, 234)'] },
      label: { default: ['rgb(0, 0, 0)'] },
      perc: { default: ['rgb(0, 128, 254)'] },
      },
      B: {
      background: {
        'CPU': ['rgb(242, 183, 98)', 'rgb(239, 198, 0)', 'rgb(231, 24, 49)', 'rgb(234, 234, 234)'],
        '메모리':    ['rgb(35, 176, 255)', 'rgb(239, 198, 0)', 'rgb(231, 24, 49)', 'rgb(234, 234, 234)'],
        '스토리지':  ['rgb(220, 166, 239)', 'rgb(239, 198, 0)', 'rgb(231, 24, 49)', 'rgb(234, 234, 234)'],
        default: ['transparent', 'transparent', 'transparent', 'transparent'],
      },
      label: { default: ['rgb(200, 200, 200)'] },
      perc: {
        'CPU':      ['rgb(242, 183, 98)'],
        '메모리':    ['rgb(35, 176, 255)'],
        '스토리지':  ['rgb(220, 166, 239)'],
        default:    ['transparent'],
      },
      },
      C: {
      background: { default: ['rgb(17, 17, 17)', 'rgb(239, 198, 0)', 'rgb(231, 24, 49)', 'rgb(234, 234, 234)'] },
      label: { default: ['rgb(131, 131, 131)'] },
      perc: { default: ['rgb(17, 17, 17)'] },
      },
      D: {
      background: { default: ['rgb(93, 178, 243)', 'rgb(239, 198, 0)', 'rgb(231, 24, 49)', 'rgb(0, 0, 0)'] },
      label: { default: ['rgb(242, 242, 242)'] },
      perc: { default: ['rgb(238, 0, 0)'] },
      },
    };
  },
```

**beforeDestroy() 선언:**

```javascript
  beforeDestroy() {
    clearTimeout(this.pollingTimer);
    /*this.resizeObserver?.disconnect();*/
    Object.values(this.charts).forEach(chart => chart?.destroy());
    this.charts = {};
  }
```

**methods 함수 선언:**

```javascript
  // 차트 초기데이터 선언부, 인스턴스 생성부 코드는 첨부하지 않는다.
  // Gauge 차트의 여러 색상값을 갈아끼우는 로직을 중점적으로 공부했기 때문.  

  /* resolveGaugeColor(): */
  resolveGaugeColor(role, title, perc) {
    //&& 색상값 created()로 분리
    const t = this.gaugeTheme[this.theme] ?? this.gaugeTheme.C;

    let category = '';
    let idx = 0;
    
    switch(role) {
    case 'BACKGROUND':
      category = 'background';
      idx = perc < /*80*/USAGE_LEVEL.WARNING ? 0 : perc < /*90*/USAGE_LEVEL.DANGER ? 1 : 2;
      break;
    case 'BACKGROUND_LEFT':
      category = 'background';
      idx = 3;
      break;
    case 'LABEL':
      category = 'label';
      break;
    case 'PERC':
      category = 'perc';
      break;
    default: return;
    }
    const palette = t[category];
    
    //palette[title]을 타는 건 리소스별 구분이 존재하는 B테마 뿐이다.
    return (palette[title] ?? palette['default'])[idx];
  },

  /* updateCharts(): */
  updateCharts() {
    const vm = this;
    const r = vm.resource;
    vm.chartMetas.forEach(g => {
      const chart = vm.charts[g.key];
      if(!chart) {
        return;
      }
    
      const perc = g.perc(r);
      if(perc == null) {
        chart.data.datasets[0].data = [0, 100];
      } else {
        const v = Math.round(perc * 10) / 10; //소수 첫째자리 cut
        chart.data.datasets[0].data = [v, Math.max(0, 100 - v)];
      }
    
      chart.update();
    });
  },
```

**디버깅용 log 출력 함수:**

```javascript
  /* logSize(): */
  logSize(label) {
    const canvasList = [this.$refs.cpuGauge, this.$refs.memGauge, this.$refs.storageGauge];
    
    canvasList.forEach( (canvas, i) => {
    console.error(`[${i}]`);
    const parent = canvas.parentElement;
    console.warn(
      `[${label}] parent=${parent.clientWidth}x${parent.clientHeight}` +
      ` | canvasAttr=${canvas.width}x${canvas.height}` +
      ` | canvasStyle=${canvas.style.width}x${canvas.style.height}` +
      ` | rect=${canvas.getBoundingClientRect().width}x${canvas.getBoundingClientRect().height}`
    );
    });
  },
```

## 개발노트 ─ Chart resize() {#dev-note-chart-resize}

> resizeObserver 대신 Chart.js 인스턴스의 options.responsive = true로 설정하는 방식이 권장 방향이다.
>
> 코드 상에서 별도의 ResizeObserver 객체가 필요했던 이유는, \<canvas> 태그 안에 BS Class를 통해 width와 height를 직접 조정하고 있었기 때문이다. 이는 공식 페이지에서 언급하는 Anti-Pattern이며, 부모 DOM 요소(HTML Element)의 크기를 Chart.js 인스턴스가 직접 받도록 하는 옵션 **`responsive: true` (default: true)** 을 켜두면, 인스턴스가 자체적으로 크기 변화를 감지해 조절한다. initResizeObserver는 과한 코드였다고 생각한다.

```javascript
  initResizeObserver() {
    const vm = this;
    this.resizeObserver = new ResizeObserver(() => {
        Object.keys(this.$refs).forEach(ref => {
          const chart = Chart.getChart(this.$refs[ref]);
          if (chart) chart.resize();
        });
    });

    // 차트가 들어있는 부모 div를 감시함
    this.resizeObserver.observe(this.$el);
  },
```

**ResizeObserver**는 **특정 DOM 요소의 크기 변화를 관찰하는 브라우저 내장 API** 이다.<br/>
`window.resize`처럼 "브라우저 창 크기"를 보는 것이 아닌, **지목한 HTML Element의 width/height가 변화하면 콜백 함수를 호출**해준다.

다만 **window.resize**가 브라우저의 뷰 포트(viewport) 크기 변화만을 감지하는 것에 반해, **ResizeObserver**는 _브라우저의 크기가 변하지 않더라도, 사이드 메뉴가 열리면서 main 영역 너비가 줄어드는 등의 **레이아웃 내부 변화**를 감지_ 할 수 있다. 콜백 안에 변화된 크기 정보(`contentRect`)가 같이 들어온다.

- `.observe()` : 크기 변화의 감지 기준이 될 DOM 요소를 넘겨준다.

ResizeObserver를 Vue의 mounted()에서 this에 생성해주고, beforeDestroy() 에도 선언해준다.

```javascript
  mounted() {
    //...
		this.initResizeObserver();
  }
```

```javascript
  beforeDestroy() {
    //...
    this.resizeObserver?.destroy();
  }
```

## 개발노트 ─ VueApp mixins {#dev-note-vueapp-mixins}

```javascript
const themeMixin = {
	data() {
		const VALID = ['A', 'B', 'C', 'D'];
		const saved = localStorage.getItem('theme');
		return { theme: VALID.includes(saved) ? saved : 'A' };
	},
	computed: {
		logoSrc() {
			const logoMap = {
				A: '/resources/images/letech/logo_a.png',
				B: '/resources/images/letech/logo_b.png',
				C: '/resources/images/letech/logo_c.png',
				D: '/resources/images/letech/logo_d.png'
			};
			return logoMap[this.theme] || logoMap.A;
		}
	},
	methods: {
		applyTheme(theme) {
			document.documentElement.setAttribute('data-bs-theme', theme);
			
			//임시: 테마 변경하면서 라이트/다크 css 적용 (Bootstrap)
			const isDark = (theme === 'B' || theme === 'D');
			document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
			document.body.classList.toggle('dark', isDark);
			
/*			//CASE::: "만약 테마별 css 파일이 서로 다르다면?"
			// (1) 모든 테마별 css를 미리 받아둔다.
			// (2) 테마 적용 스크립트를 layout <head> 내부에 심어놓고, Vue 부팅 전에 localStorage 값을 읽는다.
			<head>
			  <!-- CSS link 들보다 먼저 -->
			  <script>
			    const t = ['a','b','c','d'].includes(localStorage.getItem('theme'))
			      ? localStorage.getItem('theme') : 'a';
			    document.documentElement.setAttribute('data-bs-theme', t);
			    // theme-css link의 초기 href를 여기서 t로 박아도 됨
			  </script>
			</head>
			//-> 이것보단, 각 css파일을 하나로 합쳐서 [data-bs-theme='a'] {...}로 감싸주는 게 낫다.*/
		}
	},
	created() {
		this.applyTheme(this.theme);
	},
	watch: {
		theme(newVal) {
			localStorage.setItem('theme', newVal);
			this.applyTheme(newVal);
		}
	},
	mounted() {

	}
};

const THEME_KEY = "theme"
//추가
const VALID_THEMES = ['A', 'B', 'C', 'D'];
const DEFAULT_THEME = 'A';
function resolveTheme() {
	const saved = localStorage.getItem(THEME_KEY);
	return VALID_THEMES.includes(saved) ? saved : DEFAULT_THEME;
}

document.documentElement.setAttribute('data-bs-theme', resolveTheme());
```
