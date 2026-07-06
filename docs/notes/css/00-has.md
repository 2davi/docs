
```css
body:has(#sidebar.active) #main .burger-btn .bi-justify::before {
	transform: rotate(90deg);
	background: url(../../images/arrow_w.svg) no-repeat;
	transition: transform 1s ease;
}

body:has(#sidebar.inactive) #main .burger-btn .bi-justify::before {
	transform: rotate(0deg);
	transition: transform 1s ease;
}
```

음.
