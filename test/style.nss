@var transition
    -webkit-transition: all .5s; /* chromium */
    -o-transition: all .5s; /* opera */
    transition: all .5s; /* fallback */
@var grid
    display: -ms-grid; /* edge */
    display: grid; /* fallback */
@var theme color
    #7f5d4a
@var border | size | type // variable arguments
    $[size] $[type] $(theme color)
@var base-font-size
    2em
@var gradient
    background: linear-gradient(90deg, #fff, #000);
@var url
     url(" https://example.com ")
---
@media (max-width: 800px) {
    .body {background: blue;}
}
body {$(grid); border: $(border | size=2em | type=solid); padding: 2em;}
.title {margin-left: 1em; font-size: $(base-font-size); border-bottom: $(border|type=dotted|size=1px); $(transition);}
.title:hover {font-size: calc( $(base-font-size) * 1.25 + 1.2 / 1.5 - 0.1 )}
.content {padding: 2em;}
.content p {font-family: "sans-serif";}
.content .p-styled {color: $(theme color);}