/*

Mkswll's Mat class, under construction

*/
template <typename T> 
struct Mat {
	int n, m;
	vector<vector<T>> mat;
	
	Mat(): n(0), m(0) {}
	
	Mat(int n_): n(n_), m(n_) {
		mat.resize(n_, vector<T>(n_, 0));
	}
	
	Mat(int n_, int m_): n(n_), m(m_){
		mat.resize(n_, vector<T>(m_, 0));
	}
	
	vector<T> &operator [](int i) { return mat[i]; }
	const vector<T> &operator [](int i) const { return mat[i]; }
	
	Mat operator + (Mat t) const& {
		assert(n == t.n && m == t.m);
		Mat ret(n, m);
		for(int i = 0; i < n; ++i){
			for(int j = 0; j < m; ++j){
				ret.mat[i][j] = mat[i][j] + t.mat[i][j];
			}
		}
		return ret;
	}
	
	Mat operator * (Mat t) const& {
		assert(m == t.n);
		int p = t.m;
		Mat ret(n, p);
		for(int i = 0; i < n; ++i){
			for(int j = 0; j < p; ++j){
				for(int k = 0; k < m; ++k){
					ret.mat[i][j] = ret.mat[i][j] + mat[i][k] * t.mat[k][j];
				}
			}
		}
		return ret;
	}
	
	bool operator == (Mat t) const&	{
		if(n != t.n || m != t.m) return 0;
		return mat == t.mat;
	}
	
	Mat power(long long k){
		assert(n == m);
		Mat ret(n, m), t = *this;
		for(int i = 0; i < n; ++i) ret.mat[i][i] = 1;
		while(k){
			if(k & 1) ret = ret * t;
			k >>= 1;
			t = t * t;
		}
		return ret;
	}
	
	Mat gauss_jordan_elim(){ // if no solution or infinitely many solution, return (Mat <T>) {}
		if(n >= m) return (Mat) {};
		Mat ret = *this;
		for(int i = 0; i < n; ++i){
			int r = i;
			for(int j = i + 1; j < n; ++j){
				// if(fabs(ret.mat[j][i]) > fabs(ret.mat[r][i])) r = j;
				if(abs(ret.mat[j][i]) > abs(ret.mat[r][i])) r = j;
			}
			if(r != i) swap(ret.mat[i], ret.mat[r]);
			if(!ret.mat[i][i]){
				return (Mat) {};
			}
			T inv = (T) 1 / ret.mat[i][i];
			for(int j = 0; j < n; ++j){
				if(j == i) continue;
				T t = ret.mat[j][i] * inv;
				for(int k = i; k < m; ++k){
					ret.mat[j][k] = ret.mat[j][k] - t * ret.mat[i][k];
				}
			}
			for(int j = 0; j < m; ++j) ret.mat[i][j] = ret.mat[i][j] * inv;
		}
		return ret;
	}
	
	Mat inv(){
		Mat temp(n, n * 2);
		for(int i = 0; i < n; ++i){
			for(int j = 0; j < n; ++j){
				temp.mat[i][j] = mat[i][j];
			}
			temp.mat[i][i + n] = 1;
		}
		temp = temp.gauss_jordan_elim();
		if(temp == (Mat) {}) return (Mat) {};
		Mat ret(n, n);
		for(int i = 0; i < n; ++i){
			for(int j = 0; j < n; ++j){
				ret.mat[i][j] = temp.mat[i][j + n];
			}
		}
		return ret;
	}
};